const API = window.location.origin + '/api';
let user = null;
let fActual = null, pBase = 0, sillasSelect = [], formatoActual = '2D';
let confiteriaDB = [], confiCarrito = [], confiNombres = [];

let editPeliId = null;
let editFuncionId = null;
let editConfiId = null;

let peliculasCache = []; 
let peliculasAgrupadas = {};

document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    switchView('view-client');
    cargarCartelera();
    cargarDatosCompra();
    updateNav();
    
    const today = new Date().toISOString().split('T')[0];
    const fechaInput = document.getElementById('f-fecha');
    if (fechaInput) fechaInput.setAttribute('min', today);
}

function switchView(id) {
    ['view-client', 'view-comidas', 'view-pelicula-detalle', 'view-auth', 'view-sala', 'view-checkout', 'view-qr', 'view-admin', 'view-entradas'].forEach(v => document.getElementById(v).classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function switchMenu(vista) {
    if(user && user.rol === 'admin') {
        alert("El administrador debe usar su panel.");
        return;
    }
    switchView(vista);
    if(vista === 'view-comidas') mostrarComidasSoloVisual();
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
            cargarListaFuncionesAdmin();
            cargarListaConfiteriaAdmin();
        } else {
            btnE.style.display = 'inline-block';
            switchView('view-client');
        }
    } else {
        btnL.classList.remove('hidden'); uMenu.classList.add('hidden');
    }
}

// --- AUTH ---
async function register(e) {
    e.preventDefault();
    const payload = { 
        nombre: document.getElementById('r-nombre').value, 
        documento: document.getElementById('r-documento').value,
        email: document.getElementById('r-email').value, 
        password: document.getElementById('r-pwd').value 
    };
    try {
        const res = await fetch(`${API}/register`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const data = await res.json();
        if(res.ok && data.success) { 
            alert('Registro exitoso. ¡Ganaste 5 Puntos CINEX de bienvenida! Inicia sesión.'); 
            switchView('view-auth'); 
        } else alert(data.error || 'Error al registrar');
    } catch (error) { alert('Error conectando con el servidor.'); }
}

async function login(e) {
    e.preventDefault();
    const payload = { 
        email: document.getElementById('l-email').value, 
        password: document.getElementById('l-pwd').value 
    };
    try {
        const res = await fetch(`${API}/login`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const data = await res.json();
        if(res.ok && data.success) {
            user = data.user;
            updateNav();
        } else alert(data.error || 'Credenciales inválidas');
    } catch (error) {
        alert('Error de conexión. Verifica que Flask esté corriendo.');
    }
}

function logout() { user = null; updateNav(); switchView('view-client'); }

// --- CLIENTE ---
async function cargarCartelera() {
    try {
        const res = await fetch(`${API}/cartelera`);
        const datos = await res.json();
        peliculasAgrupadas = {};
        datos.forEach(d => {
            if(!peliculasAgrupadas[d.id]) peliculasAgrupadas[d.id] = { ...d, funciones: [] };
            if(d.funcion_id) {
                peliculasAgrupadas[d.id].funciones.push({
                    id: d.funcion_id, fecha: d.fecha, hora: d.hora, precio_base: d.precio_base
                });
            }
        });
        peliculasCache = Object.values(peliculasAgrupadas);
        renderizarPeliculas(peliculasCache);
    } catch(e) { console.error("Error cartelera", e); }
}

function renderizarPeliculas(lista) {
    const grid = document.getElementById('cartelera-grid');
    if (lista.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center;">No se encontraron películas.</p>`;
        return;
    }
    grid.innerHTML = lista.map(p => `
        <div class="pelicula-card" onclick="abrirDetallePelicula(${p.id})" style="cursor: pointer;">
            <img src="/static/uploads/${p.imagen}" onerror="this.src='https://via.placeholder.com/300x400?text=Sin+Poster'">
            <h3>${p.titulo}</h3>
            <span style="display:inline-block; padding:3px 8px; background:var(--gold); color:black; border-radius:4px; font-weight:bold; font-size:12px; margin-bottom:10px;">${p.formato || '2D'}</span>
            <p><strong>Clasificación:</strong> ${p.clasificacion}</p>
            <p><strong>Duración:</strong> ${p.duracion} min</p>
            <button class="btn-outline" style="margin-top:10px; width:100%;">Ver Funciones</button>
        </div>`).join('');
}

function filtrarPeliculas() {
    const termino = document.getElementById('movie-search').value.toLowerCase();
    const filtradas = peliculasCache.filter(p => p.titulo.toLowerCase().includes(termino) || p.actores.toLowerCase().includes(termino));
    renderizarPeliculas(filtradas);
}

function abrirDetallePelicula(id) {
    const p = peliculasAgrupadas[id];
    switchView('view-pelicula-detalle');
    document.getElementById('detalle-content').innerHTML = `
        <div style="display: flex; gap: 30px; flex-wrap: wrap;">
            <img src="/static/uploads/${p.imagen}" style="width: 250px; border-radius: 10px; box-shadow: 0 10px 20px rgba(0,0,0,0.5);" onerror="this.src='https://via.placeholder.com/300x400?text=Sin+Poster'">
            <div style="max-width: 600px;">
                <h1 style="margin:0; font-size: 40px; color: var(--gold);">${p.titulo} <span style="font-size:20px; color:white; background:#333; padding:5px 10px; border-radius:5px;">${p.formato || '2D'}</span></h1>
                <p style="font-size: 18px; line-height: 1.6; margin-top:20px;">${p.sinopsis}</p>
                <p><strong>Actores:</strong> ${p.actores}</p>
                <p><strong>Clasificación:</strong> ${p.clasificacion} | <strong>Duración:</strong> ${p.duracion} min</p>
            </div>
        </div>
    `;

    const funcGrid = document.getElementById('detalle-funciones');
    if(p.funciones.length === 0) {
        funcGrid.innerHTML = `<p>No hay funciones programadas para esta película todavía.</p>`;
        return;
    }
    funcGrid.innerHTML = p.funciones.map(f => `
        <div class="admin-panel" style="text-align: center;">
            <h3>🗓️ ${f.fecha}</h3>
            <h2>⏰ ${f.hora}</h2>
            <p style="color:var(--gold); font-size:20px; font-weight:bold;">$${f.precio_base}</p>
            <button class="btn-primary" onclick="iniciarCompra(${f.id}, ${f.precio_base}, '${p.formato}')" style="width:100%; margin-top:10px;">Comprar Asientos</button>
        </div>
    `).join('');
}

async function iniciarCompra(f_id, p_base, formato) {
    if(!user) return switchView('view-auth');
    fActual = f_id; pBase = parseFloat(p_base); sillasSelect = []; formatoActual = formato || '2D';
    const res = await fetch(`${API}/funciones/${f_id}/asientos`);
    const asientos = await res.json();
    const grid = document.getElementById('asientos-grid');
    grid.innerHTML = asientos.map(a => `<div class="asiento ${a.estado}" onclick="toggleSilla(this, ${a.id})">${a.numero}</div>`).join('');
    switchView('view-sala');
}

function toggleSilla(el, id) {
    if(el.classList.contains('ocupado')) return;
    if(el.classList.contains('seleccionado')) {
        el.classList.remove('seleccionado');
        sillasSelect = sillasSelect.filter(s => s !== id);
    } else {
        el.classList.add('seleccionado');
        sillasSelect.push(id);
    }
}

async function cargarDatosCompra() {
    const res = await fetch(`${API}/datos_compra`);
    const data = await res.json();
    confiteriaDB = data.confiteria;
    confiNombres = confiteriaDB.reduce((acc, curr) => { acc[curr.id] = curr.nombre; return acc; }, {});
}

function mostrarComidasSoloVisual() {
    const grid = document.getElementById('comidas-grid');
    grid.innerHTML = confiteriaDB.map(c => `
        <div class="admin-panel text-center">
            <img src="/static/uploads/${c.imagen}" style="width:100%; height:150px; object-fit:cover; border-radius:10px;" onerror="this.src='https://via.placeholder.com/150'">
            <h3>${c.nombre}</h3>
            <p style="color:var(--gold); font-weight:bold; font-size:18px;">$${c.precio}</p>
        </div>
    `).join('');
}

// MODIFICADO: AHORA MUESTRA LAS IMÁGENES AL COMPRAR
function irACheckout() {
    if(sillasSelect.length === 0) return alert('Selecciona al menos 1 asiento');
    confiCarrito = [];
    document.getElementById('res-asientos').innerText = sillasSelect.length;
    
    const gafasDiv = document.getElementById('gafas-3d-container');
    document.getElementById('check-gafas').checked = false; 
    if(formatoActual === '3D') gafasDiv.classList.remove('hidden');
    else gafasDiv.classList.add('hidden');

    const grid = document.getElementById('confi-grid');
    grid.innerHTML = confiteriaDB.map(c => `
        <div style="background: #2b3542; padding: 15px; border-radius: 8px; display: flex; align-items: center; gap: 15px;">
            <img src="/static/uploads/${c.imagen}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px;" onerror="this.src='https://via.placeholder.com/70'">
            <div style="flex-grow: 1;">
                <h4 style="margin:0;">${c.nombre}</h4>
                <small style="color:var(--gold); font-size: 15px;">$${c.precio}</small>
            </div>
            <div style="display: flex; align-items: center;">
                <button class="btn-outline" style="padding: 5px 12px;" onclick="modConfi(${c.id}, -1, ${c.precio})">-</button>
                <span id="cant-${c.id}" style="margin: 0 15px; font-weight: bold; font-size: 16px;">0</span>
                <button class="btn-outline" style="padding: 5px 12px;" onclick="modConfi(${c.id}, 1, ${c.precio})">+</button>
            </div>
        </div>
    `).join('');
    calcularTotal();
    switchView('view-checkout');
}

function modConfi(id, cant, precio) {
    let item = confiCarrito.find(c => c.id === id);
    if(!item) { if(cant > 0) confiCarrito.push({id, cant, precio}); }
    else { item.cant += cant; if(item.cant <= 0) confiCarrito = confiCarrito.filter(c => c.id !== id); }
    const span = document.getElementById(`cant-${id}`);
    if(span) span.innerText = item ? item.cant : 0;
    calcularTotal();
}

function calcularTotal() {
    let t = pBase * sillasSelect.length;
    if(formatoActual === '3D' && document.getElementById('check-gafas').checked) t += 3000 * sillasSelect.length;
    confiCarrito.forEach(c => t += c.precio * c.cant);
    document.getElementById('total-pago').innerText = t;
    
    let resHtml = confiCarrito.map(c => `<p>${c.cant}x ${confiNombres[c.id]} <span style="float:right;">$${c.precio * c.cant}</span></p>`).join('');
    if(formatoActual === '3D' && document.getElementById('check-gafas').checked) {
        resHtml += `<p style="color:var(--gold);">${sillasSelect.length}x Gafas 3D <span style="float:right;">$${3000 * sillasSelect.length}</span></p>`;
    }
    document.getElementById('res-confi').innerHTML = resHtml;
}

async function procesarPago() {
    const metodo = document.getElementById('metodo-pago').value;
    const btnPago = document.querySelector('#view-checkout .btn-primary');
    
    btnPago.disabled = true;
    btnPago.style.backgroundColor = "#555";
    btnPago.innerText = "⏳ Contactando al banco...";

    setTimeout(async () => {
        btnPago.innerText = "✅ Aprobando transacción...";
        const payload = {
            usuario_id: user.id, funcion_id: fActual, asientos: sillasSelect, 
            total: parseFloat(document.getElementById('total-pago').innerText), metodo_pago: metodo
        };
        try {
            const res = await fetch(`${API}/comprar`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            const data = await res.json();
            if(data.success) {
                document.getElementById('qr-img').src = data.qr;
                document.getElementById('qr-pin').innerText = data.codigo;
                document.getElementById('qr-asientos').innerText = data.asientos;
                
                if(data.puntos_ganados > 0) {
                    alert(`¡Felicidades! Ganaste ${data.puntos_ganados} Puntos CINEX con esta compra. ⭐`);
                }
                
                switchView('view-qr');
            } else alert(data.error);
        } catch (error) { alert('Error de conexión al procesar el pago.'); } 
        finally {
            btnPago.disabled = false;
            btnPago.style.backgroundColor = "var(--primary)";
            btnPago.innerText = "Pagar Ahora";
        }
    }, 2500); 
}

async function verMisEntradas() {
    const resPuntos = await fetch(`${API}/mis_puntos/${user.id}`);
    const dataPuntos = await resPuntos.json();
    document.getElementById('user-puntos').innerText = dataPuntos.puntos;

    const res = await fetch(`${API}/mis_entradas/${user.id}`);
    const entradas = await res.json();
    const div = document.getElementById('lista-entradas');
    if(entradas.length === 0) div.innerHTML = "<p>No tienes compras aún.</p>";
    else {
        div.innerHTML = entradas.map(e => {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(e.codigo_qr)}`;
            return `
            <div class="admin-panel" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:20px;">
                <div style="display:flex; gap: 20px; align-items:center;">
                    <img src="/static/uploads/${e.imagen}" style="width:80px; border-radius:5px;" onerror="this.src='https://via.placeholder.com/80'">
                    <div>
                        <h2 style="margin:0; color:var(--gold);">${e.titulo}</h2>
                        <p style="margin:5px 0;">🗓️ ${e.fecha} | ⏰ ${e.hora}</p>
                        <p style="margin:0;"><strong>Sillas:</strong> ${e.sillas}</p>
                        <p style="margin:5px 0;"><strong>Total Pagado:</strong> $${e.total} (${e.estado.toUpperCase()})</p>
                    </div>
                </div>
                <div style="text-align: center; background: white; padding: 10px; border-radius: 10px;">
                    <img src="${qrUrl}" alt="QR" style="width: 100px; height: 100px;">
                    <p style="color: black; margin: 5px 0 0 0; font-weight: bold; font-size: 18px;">PIN: ${e.codigo_validacion}</p>
                </div>
            </div>`;
        }).join('');
    }
    switchView('view-entradas');
}

// --- ADMIN ---
async function cargarStats() {
    const res = await fetch(`${API}/admin/stats`);
    const data = await res.json();
    document.getElementById('stat-ingresos').innerText = data.ingresos;
    document.getElementById('stat-boletos').innerText = data.boletos;
    document.getElementById('stat-ocupacion').innerText = data.ocupacion;
}

async function cargarPeliculasSelectAdmin() {
    const res = await fetch(`${API}/peliculas`);
    const pelis = await res.json();
    document.getElementById('f-pelicula').innerHTML = pelis.map(p => `<option value="${p.id}">${p.titulo}</option>`).join('');
    
    const tbody = document.getElementById('tabla-admin-peliculas');
    tbody.innerHTML = pelis.map(p => `
        <tr style="border-bottom: 1px solid #333;">
            <td style="padding: 10px;">${p.id}</td>
            <td>${p.titulo}</td>
            <td>${p.duracion} min</td>
            <td><span style="color:var(--gold);">${p.formato || '2D'}</span></td>
            <td>
                <button class="btn-outline" style="padding: 5px 10px;" onclick='prepararEdicionPelicula(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Editar</button>
                <button class="btn-primary" style="padding: 5px 10px; background: #8B0000; border: none;" onclick="eliminarPelicula(${p.id})">Borrar</button>
            </td>
        </tr>
    `).join('');
}

function prepararEdicionPelicula(peli) {
    editPeliId = peli.id;
    document.getElementById('p-titulo').value = peli.titulo;
    document.getElementById('p-sinopsis').value = peli.sinopsis;
    document.getElementById('p-clasificacion').value = peli.clasificacion;
    document.getElementById('p-duracion').value = peli.duracion;
    document.getElementById('p-actores').value = peli.actores;
    document.getElementById('p-formato').value = peli.formato || '2D';
    document.getElementById('p-img').removeAttribute('required');
    
    const btn = document.getElementById('btn-guardar-peli');
    btn.innerText = "Actualizar Película";
    btn.classList.replace('btn-primary', 'btn-secondary');
    window.scrollTo(0, 0);
}

async function eliminarPelicula(id) {
    if(!confirm('¿Estás seguro de eliminar esta película y todo su historial de ventas?')) return;
    const res = await fetch(`${API}/admin/peliculas/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if(data.success) { alert('Película eliminada'); cargarPeliculasSelectAdmin(); cargarCartelera(); }
    else alert(data.error);
}

async function addOrUpdatePelicula(e) {
    e.preventDefault();
    const fd = new FormData();
    fd.append('titulo', document.getElementById('p-titulo').value);
    fd.append('sinopsis', document.getElementById('p-sinopsis').value);
    fd.append('clasificacion', document.getElementById('p-clasificacion').value);
    fd.append('duracion', document.getElementById('p-duracion').value);
    fd.append('actores', document.getElementById('p-actores').value);
    fd.append('formato', document.getElementById('p-formato').value);
    
    const imgFile = document.getElementById('p-img').files[0];
    if(imgFile) fd.append('imagen', imgFile);

    let url = `${API}/admin/peliculas`;
    let method = 'POST';
    if(editPeliId) { url = `${API}/admin/peliculas/${editPeliId}`; method = 'PUT'; }

    try {
        const res = await fetch(url, { method: method, body: fd });
        const data = await res.json(); 
        if(res.ok && data.success) { 
            alert(editPeliId ? 'Película actualizada' : 'Película guardada'); 
            e.target.reset(); 
            editPeliId = null;
            const btn = document.getElementById('btn-guardar-peli');
            btn.innerText = "Registrar Película";
            btn.classList.replace('btn-secondary', 'btn-primary');
            document.getElementById('p-img').setAttribute('required', 'true');
            cargarPeliculasSelectAdmin(); 
            cargarCartelera();
        } else alert(data.error || 'Ocurrió un error.');
    } catch (error) { alert('Error de conexión con el servidor.'); }
}

async function cargarListaFuncionesAdmin() {
    const res = await fetch(`${API}/admin/funciones_lista`);
    const funciones = await res.json();
    const tbody = document.getElementById('tabla-admin-funciones');
    
    tbody.innerHTML = funciones.map(f => {
        let porcentaje = ((f.ocupados / 150) * 100).toFixed(1); 
        let color = f.ocupados > 0 ? 'var(--gold)' : '#aaa';
        
        return `
        <tr style="border-bottom: 1px solid #333;">
            <td style="padding: 10px; font-weight:bold;">${f.titulo}</td>
            <td>🗓️ ${f.fecha} <br> ⏰ ${f.hora}</td>
            <td>$${f.precio_base}</td>
            <td style="color:${color}; font-weight:bold;">${f.ocupados}/150 (${porcentaje}%)</td>
            <td>
                <button class="btn-outline" style="padding: 5px 10px;" onclick='prepararEdicionFuncion(${JSON.stringify(f).replace(/'/g, "&#39;")})'>Editar</button>
                <button class="btn-primary" style="padding: 5px 10px; background: #8B0000; border: none;" onclick="eliminarFuncionReal(${f.id})">Borrar</button>
            </td>
        </tr>
    `}).join('');
}

function prepararEdicionFuncion(f) {
    editFuncionId = f.id;
    const select = document.getElementById('f-pelicula');
    for(let i=0; i<select.options.length; i++) {
        if(select.options[i].text === f.titulo) select.selectedIndex = i;
    }
    document.getElementById('f-fecha').value = f.fecha;
    document.getElementById('f-hora').value = f.hora;
    document.getElementById('f-precio').value = f.precio_base;
    
    const btn = document.querySelector('#form-funcion button[type="submit"]');
    btn.innerText = "Actualizar Función";
    btn.classList.replace('btn-secondary', 'btn-primary');
    window.scrollTo(0, 0);
}

async function eliminarFuncionReal(id) {
    if(!confirm('¿Seguro que deseas eliminar esta función? Se borrarán los tiquetes.')) return;
    const res = await fetch(`${API}/admin/funciones/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if(data.success) { alert('Función eliminada'); cargarListaFuncionesAdmin(); cargarCartelera(); cargarStats(); }
    else alert(data.error);
}

async function addFuncion(e) {
    e.preventDefault();
    const payload = { 
        pelicula_id: document.getElementById('f-pelicula').value, 
        fecha: document.getElementById('f-fecha').value, 
        hora: document.getElementById('f-hora').value, 
        precio_base: document.getElementById('f-precio').value 
    };

    let url = `${API}/admin/funciones`;
    let method = 'POST';
    if(editFuncionId) { url = `${API}/admin/funciones/${editFuncionId}`; method = 'PUT'; }

    const res = await fetch(url, { method: method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const data = await res.json();
    
    if(data.success) { 
        alert(editFuncionId ? 'Función actualizada' : 'Función programada'); 
        e.target.reset(); 
        editFuncionId = null;
        const btn = document.querySelector('#form-funcion button[type="submit"]');
        btn.innerText = "Asignar a Sala";
        btn.classList.replace('btn-primary', 'btn-secondary');
        cargarStats(); 
        cargarListaFuncionesAdmin();
        cargarCartelera();
    } else alert(data.error);
}

async function cargarListaConfiteriaAdmin() {
    const res = await fetch(`${API}/datos_compra`);
    const data = await res.json();
    const tbody = document.getElementById('tabla-admin-confiteria');
    
    tbody.innerHTML = data.confiteria.map(c => `
        <tr style="border-bottom: 1px solid #333;">
            <td style="padding: 10px;"><img src="/static/uploads/${c.imagen}" style="width:50px; border-radius:5px;" onerror="this.src='https://via.placeholder.com/50'"></td>
            <td style="font-weight:bold;">${c.nombre}</td>
            <td style="color:var(--gold);">$${c.precio}</td>
            <td>
                <button class="btn-outline" style="padding: 5px 10px;" onclick='prepararEdicionConfiteria(${JSON.stringify(c).replace(/'/g, "&#39;")})'>Editar</button>
                <button class="btn-primary" style="padding: 5px 10px; background: #8B0000; border: none;" onclick="eliminarConfiteria(${c.id})">Borrar</button>
            </td>
        </tr>
    `).join('');
}

function prepararEdicionConfiteria(c) {
    editConfiId = c.id;
    document.getElementById('c-nombre').value = c.nombre;
    document.getElementById('c-precio').value = c.precio;
    document.getElementById('c-img').removeAttribute('required');
    
    const btn = document.querySelector('#form-confiteria button[type="submit"]');
    btn.innerText = "Actualizar Producto";
    btn.classList.replace('btn-outline', 'btn-secondary');
    window.scrollTo(0, 0);
}

async function eliminarConfiteria(id) {
    if(!confirm('¿Eliminar este producto de confitería?')) return;
    const res = await fetch(`${API}/admin/confiteria/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if(data.success) { alert('Producto eliminado'); cargarListaConfiteriaAdmin(); cargarDatosCompra(); }
    else alert(data.error);
}

async function addConfiteria(e) {
    e.preventDefault();
    const fd = new FormData();
    fd.append('nombre', document.getElementById('c-nombre').value);
    fd.append('precio', document.getElementById('c-precio').value);
    const imgFile = document.getElementById('c-img').files[0];
    if(imgFile) fd.append('imagen', imgFile);

    let url = `${API}/admin/confiteria`;
    let method = 'POST';
    if(editConfiId) { url = `${API}/admin/confiteria/${editConfiId}`; method = 'PUT'; }

    const res = await fetch(url, { method: method, body: fd });
    const data = await res.json();
    
    if(data.success) { 
        alert(editConfiId ? 'Producto actualizado' : 'Producto agregado con éxito'); 
        e.target.reset(); 
        editConfiId = null;
        document.getElementById('c-img').setAttribute('required', 'true');
        const btn = document.querySelector('#form-confiteria button[type="submit"]');
        btn.innerText = "Añadir Producto";
        btn.classList.replace('btn-secondary', 'btn-outline');
        cargarDatosCompra(); 
        cargarListaConfiteriaAdmin();
    } else alert(data.error || 'Error al guardar');
}

async function validarIngreso() {
    const res = await fetch(`${API}/admin/validar`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({codigo: document.getElementById('v-codigo').value}) });
    const data = await res.json();
    if(data.success) { alert(data.mensaje); cargarStats(); } else alert(data.error);
}