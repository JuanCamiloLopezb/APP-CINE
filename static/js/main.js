const API = '/api';
let user = null;
let fActual = null, pBase = 0, sillasSelect = [];
let confiteriaDB = [], confiCarrito = [], confiNombres = [];
let editPeliId = null;

document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    switchView('view-client');
    cargarCartelera();
    updateNav();
}

function switchView(id) {
    ['view-client', 'view-auth', 'view-sala', 'view-checkout', 'view-qr', 'view-admin', 'view-entradas'].forEach(v => document.getElementById(v).classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function updateNav() {
    const btnL = document.getElementById('btn-login');
    const uMenu = document.getElementById('user-menu');
    const btnE = document.getElementById('btn-entradas');
    if(user) {
        btnL.classList.add('hidden'); uMenu.classList.remove('hidden');
        document.getElementById('user-display').innerText = `Hola, ${user.nombre}`;
        if(user.rol === 'admin') {
            btnE.style.display = 'none'; 
            switchView('view-admin');
            cargarStats();
            cargarPeliculasSelectAdmin();
        } else {
            btnE.style.display = 'inline-block';
            switchView('view-client'); 
        }
    } else {
        btnL.classList.remove('hidden'); uMenu.classList.add('hidden');
    }
}

// --- AUTH ---
async function register() {
    const payload = { nombre: document.getElementById('reg-nombre').value, email: document.getElementById('reg-email').value, password: document.getElementById('reg-pass').value };
    if(!payload.nombre || !payload.email || !payload.password) return alert("Llena todos los campos");
    const res = await fetch(`${API}/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const data = await res.json();
    if(data.success) { alert('Cuenta creada. Inicia sesión arriba.'); } else alert(data.error);
}

async function login() {
    const res = await fetch(`${API}/login`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: document.getElementById('log-email').value, password: document.getElementById('log-pass').value }) });
    const data = await res.json();
    if(data.success) { user = data.user; updateNav(); } else alert(data.error);
}
function logout() { user = null; initApp(); }

// --- MIS ENTRADAS ---
async function verMisEntradas() {
    if(!user) return;
    const res = await fetch(`${API}/mis_entradas/${user.id}`);
    const entradas = await res.json();
    document.getElementById('entradas-grid').innerHTML = entradas.length > 0 ? entradas.map(e => `
        <div class="pelicula-card" style="padding: 25px; text-align: left; position: relative;">
            <h3 style="color:var(--gold); margin-top:0; font-size:18px;">🎬 ${e.titulo}</h3>
            <p style="margin:5px 0;">📅 ${e.fecha}</p>
            <p style="margin:5px 0;">⏰ ${e.hora}</p>
            <p style="margin:5px 0;">💺 <strong>Sillas:</strong> ${e.sillas}</p>
            <p style="margin:5px 0;">💳 <strong>Total pagado:</strong> $${e.total}</p>
            <div class="qr-text" style="text-align:center; margin-top:15px; background: #000; padding:15px; border-radius:10px;">
                <p style="margin:0; font-size:12px; color:var(--text);">PIN DE INGRESO</p>
                <span style="font-size:32px; font-weight:900; color:var(--primary); font-family:'Montserrat', sans-serif;">${e.codigo_validacion}</span>
            </div>
            <div style="position:absolute; top:20px; right:20px; background:${e.estado==='usado'?'#444':'#2ecc71'}; color:${e.estado==='usado'?'#aaa':'#000'}; padding:5px 10px; border-radius:5px; font-size:12px; font-weight:bold;">
                ${e.estado.toUpperCase()}
            </div>
        </div>
    `).join('') : '<h3 style="grid-column: 1/-1; text-align:center; margin-top:50px;">Aún no has comprado entradas.</h3>';
    switchView('view-entradas');
}

// --- CLIENTE CARTELERA ---
async function cargarCartelera() {
    const res = await fetch(`${API}/cartelera`);
    const pelis = await res.json();
    document.getElementById('cartelera-grid').innerHTML = pelis.map(p => `
        <div class="pelicula-card">
            <img src="/static/uploads/${p.imagen}" onerror="this.src='https://via.placeholder.com/300x400?text=Sin+Poster'">
            <h3>${p.titulo}</h3>
            <p><strong>Clasificación:</strong> ${p.clasificacion} | <strong>Duración:</strong> ${p.duracion} min</p>
            <p>🗓️ ${p.fecha} - ⏰ ${p.hora}</p>
            <p style="color:var(--gold); font-size:20px; font-weight:bold; font-family:'Montserrat', sans-serif;">$${p.precio_base}</p>
            <button class="btn-primary" onclick="iniciarCompra(${p.funcion_id}, ${p.precio_base})">Comprar Entradas</button>
        </div>`).join('');
}

// --- FLUJO COMPRA ---
async function iniciarCompra(fId, precio) {
    if(!user) { alert("Inicia sesión para comprar."); switchView('view-auth'); return; }
    fActual = fId; pBase = precio; sillasSelect = []; 
    const res = await fetch(`${API}/funciones/${fId}/asientos`);
    const asientos = await res.json();
    document.getElementById('mapa-asientos').innerHTML = asientos.map(a => `<div class="asiento ${a.estado}" onclick="toggleSilla(${a.id}, '${a.estado}', this)">${a.numero}</div>`).join('');
    switchView('view-sala');
}

function toggleSilla(id, estado, el) {
    if(estado === 'ocupado') return;
    const idx = sillasSelect.indexOf(id);
    if(idx > -1) { sillasSelect.splice(idx, 1); el.classList.remove('seleccionado'); }
    else { sillasSelect.push(id); el.classList.add('seleccionado'); }
}

async function irACheckout() {
    if(!sillasSelect.length) return alert('Selecciona al menos una silla.');
    confiCarrito = []; confiNombres = [];
    document.getElementById('lista-confi').innerHTML = 'Ningún producto seleccionado.';
    
    const res = await fetch(`${API}/datos_compra`);
    const data = await res.json();
    document.getElementById('confiteria-grid').innerHTML = data.confiteria.map(c => `
        <div style="background:#222; padding:15px; border-radius:15px; text-align:center;">
            <img src="${c.imagen}" style="width:100%; height:120px; object-fit:cover; border-radius:10px; margin-bottom:10px;" onerror="this.style.display='none'">
            <h4 style="margin:5px 0;">${c.nombre}</h4>
            <p style="color:var(--gold); font-weight:bold; margin:5px 0;">$${c.precio}</p>
            <button class="btn-outline" onclick="addConfi(${c.precio}, '${c.nombre}')">Añadir +</button>
        </div>`).join('');
    calcTotal();
    switchView('view-checkout');
}

function addConfi(precio, nombre) { 
    confiCarrito.push(precio); confiNombres.push(nombre);
    document.getElementById('lista-confi').innerHTML = confiNombres.map(n => `<li>${n}</li>`).join('');
    calcTotal(); 
}
function calcTotal() { document.getElementById('total-final').innerText = (sillasSelect.length * pBase) + confiCarrito.reduce((a,b)=>a+b, 0); }

async function procesarCompra() {
    const payload = { usuario_id: user.id, funcion_id: fActual, asientos: sillasSelect, metodo_pago: document.getElementById('metodo-pago').value, total: parseFloat(document.getElementById('total-final').innerText) };
    const res = await fetch(`${API}/comprar`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const data = await res.json();
    if(data.success) {
        document.getElementById('qr-img').src = data.qr;
        document.getElementById('qr-asientos').innerText = data.asientos;
        document.getElementById('qr-codigo').innerText = data.codigo;
        switchView('view-qr');
    } else { alert(data.error); iniciarCompra(fActual, pBase); }
}

// --- ADMIN MÉTODOS ---
async function cargarStats() {
    const res = await fetch(`${API}/admin/stats`);
    const data = await res.json();
    document.getElementById('stat-ventas').innerText = data.ingresos;
    document.getElementById('stat-boletos').innerText = data.boletos;
    document.getElementById('stat-ocupacion').innerText = data.ocupacion;
}

// NUEVO: CARGAR PELÍCULAS EN TABLA Y SELECT
async function cargarPeliculasSelectAdmin() {
    const res = await fetch(`${API}/peliculas`);
    const pelis = await res.json();
    
    // Llenar Select de Funciones
    document.getElementById('f-pelicula').innerHTML = pelis.map(p => `<option value="${p.id}">${p.titulo}</option>`).join('');
    
    // Llenar Tabla Administrador
    document.getElementById('tabla-admin-peliculas').innerHTML = pelis.map(p => `
        <tr style="border-bottom: 1px solid #333;">
            <td style="padding: 10px;">${p.id}</td>
            <td>${p.titulo}</td>
            <td>${p.duracion} min</td>
            <td>${p.clasificacion}</td>
            <td>
                <button class="btn-outline" style="padding: 5px 15px; font-size: 12px; border-color:var(--gold); color:var(--gold); width:auto; margin:0;" onclick="prepararEdicion(${p.id}, '${p.titulo}', '${p.sinopsis}', ${p.duracion}, '${p.clasificacion}', '${p.actores}')">Editar</button>
                <button class="btn-primary" style="padding: 5px 15px; font-size: 12px; width:auto; margin:0;" onclick="eliminarPelicula(${p.id})">Borrar</button>
            </td>
        </tr>
    `).join('');
}

// NUEVO: FUNCIONES DE EDICIÓN Y ELIMINACIÓN
function prepararEdicion(id, tit, sin, dur, clas, act) {
    editPeliId = id;
    document.getElementById('p-tit').value = tit;
    document.getElementById('p-sin').value = sin;
    document.getElementById('p-dur').value = dur;
    document.getElementById('p-clas').value = clas;
    document.getElementById('p-act').value = act;
    document.getElementById('p-img').removeAttribute('required'); 
    
    const btn = document.getElementById('btn-guardar-peli');
    btn.innerText = "Actualizar Película";
    btn.classList.replace('btn-primary', 'btn-secondary');
    window.scrollTo(0, document.getElementById('form-pelicula').offsetTop);
}

async function eliminarPelicula(id) {
    if(!confirm("¿Seguro que deseas borrar esta película?")) return;
    const res = await fetch(`${API}/admin/peliculas/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if(data.success) { alert("Película eliminada"); cargarPeliculasSelectAdmin(); cargarCartelera(); }
    else { alert(data.error); } // Muestra error si tiene funciones asociadas
}

async function savePelicula(e) {
    e.preventDefault();
    const fd = new FormData();
    ['tit', 'sin', 'dur', 'clas', 'act'].forEach(k => fd.append(k === 'tit'?'titulo':k==='sin'?'sinopsis':k==='dur'?'duracion':k==='clas'?'clasificacion':'actores', document.getElementById(`p-${k}`).value));
    
    const img = document.getElementById('p-img').files[0];
    if(img) fd.append('imagen', img);

    const url = editPeliId ? `${API}/admin/peliculas/${editPeliId}` : `${API}/admin/peliculas`;
    const metodo = editPeliId ? 'PUT' : 'POST';

    const res = await fetch(url, { method: metodo, body: fd });
    if(res.ok) { 
        alert(editPeliId ? 'Película actualizada' : 'Película guardada'); 
        e.target.reset(); 
        editPeliId = null;
        const btn = document.getElementById('btn-guardar-peli');
        btn.innerText = "Registrar Película";
        btn.classList.replace('btn-secondary', 'btn-primary');
        document.getElementById('p-img').setAttribute('required', 'true');
        cargarPeliculasSelectAdmin(); 
        cargarCartelera();
    }
}

async function addFuncion(e) {
    e.preventDefault();
    const payload = { pelicula_id: document.getElementById('f-pelicula').value, fecha: document.getElementById('f-fecha').value, hora: document.getElementById('f-hora').value, precio_base: document.getElementById('f-precio').value };
    const res = await fetch(`${API}/admin/funciones`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const data = await res.json();
    if(data.success) { alert('Función programada correctamente.'); e.target.reset(); cargarStats(); } else alert(data.error);
}

async function validarIngreso() {
    const res = await fetch(`${API}/admin/validar`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({codigo: document.getElementById('v-codigo').value}) });
    const data = await res.json();
    alert(data.success ? `✅ ${data.mensaje}` : `❌ ${data.error}`);
    document.getElementById('v-codigo').value = '';
    cargarStats(); 
}