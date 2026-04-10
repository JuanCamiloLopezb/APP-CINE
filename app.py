import os, time, random, io, base64, pymysql, qrcode
from werkzeug.utils import secure_filename
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)
os.makedirs(os.path.join('static', 'uploads'), exist_ok=True)
app.config['UPLOAD_FOLDER'] = os.path.join('static', 'uploads')

def get_db():
    return pymysql.connect(
        host=os.getenv('DB_HOST'), user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'), database=os.getenv('DB_NAME'),
        cursorclass=pymysql.cursors.DictCursor
    )

@app.route('/')
def index(): return render_template('index.html')

# --- AUTH ---
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO usuarios (nombre, email, password) VALUES (%s, %s, %s)", (data['nombre'], data['email'], data['password']))
        conn.commit()
        return jsonify({"success": True})
    except pymysql.IntegrityError:
        return jsonify({"error": "Email registrado"}), 400
    finally: conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("SELECT id, nombre, rol FROM usuarios WHERE email=%s AND password=%s", (data['email'], data['password']))
        user = cursor.fetchone()
    conn.close()
    return jsonify({"success": True, "user": user}) if user else jsonify({"error": "Error de credenciales"}), 401

# --- ADMIN ---
@app.route('/api/peliculas', methods=['GET'])
def get_all_peliculas():
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM peliculas") # AHORA TRAE TODA LA INFO
        datos = cursor.fetchall()
    conn.close()
    return jsonify(datos)

@app.route('/api/admin/stats', methods=['GET'])
def admin_stats():
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("SELECT SUM(total) as ingresos, COUNT(id) as boletos FROM tiquetes WHERE estado IN ('activo', 'usado')")
        tiquetes = cursor.fetchone()
        cursor.execute("SELECT COUNT(id) as total_funciones FROM funciones")
        funciones = cursor.fetchone()
    conn.close()
    ingresos = tiquetes['ingresos'] or 0
    boletos = tiquetes['boletos'] or 0
    t_func = funciones['total_funciones'] or 0
    ocupacion = (boletos / (t_func * 150)) * 100 if t_func > 0 else 0
    return jsonify({"ingresos": float(ingresos), "boletos": boletos, "ocupacion": round(ocupacion, 1)})

@app.route('/api/admin/peliculas', methods=['POST'])
def add_pelicula():
    conn = get_db()
    with conn.cursor() as cursor:
        imagen = request.files.get('imagen')
        filename = secure_filename(imagen.filename) if imagen else ""
        if imagen: imagen.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        cursor.execute("INSERT INTO peliculas (titulo, sinopsis, clasificacion, duracion, actores, imagen) VALUES (%s, %s, %s, %s, %s, %s)",
                       (request.form['titulo'], request.form['sinopsis'], request.form['clasificacion'], request.form['duracion'], request.form['actores'], filename))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# NUEVO: EDITAR PELÍCULA
@app.route('/api/admin/peliculas/<int:id>', methods=['PUT'])
def edit_pelicula(id):
    conn = get_db()
    with conn.cursor() as cursor:
        imagen = request.files.get('imagen')
        if imagen:
            filename = secure_filename(imagen.filename)
            imagen.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            cursor.execute("UPDATE peliculas SET titulo=%s, sinopsis=%s, clasificacion=%s, duracion=%s, actores=%s, imagen=%s WHERE id=%s",
                           (request.form['titulo'], request.form['sinopsis'], request.form['clasificacion'], request.form['duracion'], request.form['actores'], filename, id))
        else:
            cursor.execute("UPDATE peliculas SET titulo=%s, sinopsis=%s, clasificacion=%s, duracion=%s, actores=%s WHERE id=%s",
                           (request.form['titulo'], request.form['sinopsis'], request.form['clasificacion'], request.form['duracion'], request.form['actores'], id))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# NUEVO: ELIMINAR PELÍCULA
@app.route('/api/admin/peliculas/<int:id>', methods=['DELETE'])
def delete_pelicula(id):
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM peliculas WHERE id=%s", (id,))
        conn.commit()
        return jsonify({"success": True})
    except pymysql.IntegrityError:
        return jsonify({"error": "No puedes eliminar esta película porque tiene funciones y boletos vendidos asociados. Primero elimina sus funciones."}), 400
    finally: conn.close()

@app.route('/api/admin/funciones', methods=['POST'])
def add_funcion():
    data = request.json
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("SELECT id FROM funciones WHERE fecha=%s AND hora=%s", (data['fecha'], data['hora']))
        if cursor.fetchone(): return jsonify({"error": "Ya existe una función en esa fecha y hora."}), 400
        cursor.execute("INSERT INTO funciones (pelicula_id, fecha, hora, precio_base) VALUES (%s, %s, %s, %s)",
                       (data['pelicula_id'], data['fecha'], data['hora'], data['precio_base']))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/admin/validar', methods=['POST'])
def validar_tiquete():
    codigo = request.json['codigo']
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM tiquetes WHERE codigo_validacion=%s", (codigo,))
        t = cursor.fetchone()
        if not t: return jsonify({"error": "Tiquete no existe"})
        if t['estado'] == 'usado': return jsonify({"error": "Tiquete ya usado"})
        cursor.execute("UPDATE tiquetes SET estado='usado' WHERE id=%s", (t['id'],))
        conn.commit()
        return jsonify({"success": True, "mensaje": "Ingreso autorizado."})

# --- CLIENTE ---
@app.route('/api/datos_compra', methods=['GET'])
def get_datos_compra():
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM confiteria")
        confi = cursor.fetchall()
    conn.close()
    for c in confi: c['precio'] = float(c['precio'])
    return jsonify({"confiteria": confi})

@app.route('/api/cartelera', methods=['GET'])
def cartelera():
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("SELECT p.*, f.id as funcion_id, f.fecha, f.hora, f.precio_base FROM peliculas p JOIN funciones f ON p.id = f.pelicula_id")
        datos = cursor.fetchall()
    for d in datos: d['hora'], d['fecha'], d['precio_base'] = str(d['hora']), str(d['fecha']), float(d['precio_base'])
    conn.close()
    return jsonify(datos)

@app.route('/api/funciones/<int:f_id>/asientos', methods=['GET'])
def asientos(f_id):
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT a.id, a.numero, 
            IF((SELECT COUNT(*) FROM detalle_tiquete_asientos dta JOIN tiquetes t ON dta.tiquete_id = t.id WHERE dta.asiento_id = a.id AND t.funcion_id = %s) > 0, 
            'ocupado', 'libre') as estado FROM asientos a
        """, (f_id,))
        datos = cursor.fetchall()
    conn.close()
    return jsonify(datos)

@app.route('/api/mis_entradas/<int:u_id>', methods=['GET'])
def mis_entradas(u_id):
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT t.id, t.codigo_validacion, t.total, t.estado, f.fecha, f.hora, p.titulo, p.imagen,
                   (SELECT GROUP_CONCAT(a.numero SEPARATOR ', ') FROM detalle_tiquete_asientos dta JOIN asientos a ON dta.asiento_id = a.id WHERE dta.tiquete_id = t.id) as sillas
            FROM tiquetes t JOIN funciones f ON t.funcion_id = f.id JOIN peliculas p ON f.pelicula_id = p.id
            WHERE t.usuario_id = %s ORDER BY t.id DESC
        """, (u_id,))
        datos = cursor.fetchall()
    for d in datos: d['fecha'], d['hora'], d['total'] = str(d['fecha']), str(d['hora']), float(d['total'])
    conn.close()
    return jsonify(datos)

@app.route('/api/comprar', methods=['POST'])
def comprar():
    data = request.json
    conn = get_db()
    try:
        conn.begin()
        with conn.cursor() as cursor:
            cursor.execute("SELECT dta.id FROM detalle_tiquete_asientos dta JOIN tiquetes t ON dta.tiquete_id = t.id WHERE t.funcion_id = %s AND dta.asiento_id IN %s", (data['funcion_id'], tuple(data['asientos'])))
            if cursor.fetchone(): return jsonify({"error": "Asientos ya ocupados. Refresca e intenta de nuevo."}), 400
            cod_val = str(random.randint(1000, 9999))
            cursor.execute("SELECT numero FROM asientos WHERE id IN %s", (tuple(data['asientos']),))
            sillas = ", ".join([r['numero'] for r in cursor.fetchall()])
            qr_text = f"CINEX | Cliente: {data['usuario_id']} | Función: {data['funcion_id']} | Asientos: {sillas} | Cod: {cod_val}"
            cursor.execute("INSERT INTO tiquetes (codigo_qr, codigo_validacion, usuario_id, funcion_id, metodo_pago, total) VALUES (%s, %s, %s, %s, %s, %s)",
                           (qr_text, cod_val, data['usuario_id'], data['funcion_id'], data['metodo_pago'], data['total']))
            t_id = cursor.lastrowid
            for a_id in data['asientos']: cursor.execute("INSERT INTO detalle_tiquete_asientos (tiquete_id, asiento_id) VALUES (%s, %s)", (t_id, a_id))
            qr = qrcode.make(qr_text)
            buf = io.BytesIO()
            qr.save(buf, format="PNG")
        conn.commit()
        return jsonify({"success": True, "qr": f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}", "codigo": cod_val, "asientos": sillas})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally: conn.close()

if __name__ == '__main__': app.run(host='0.0.0.0', port=5000, debug=True)