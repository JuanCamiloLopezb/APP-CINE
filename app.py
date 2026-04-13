import os, time, random, io, base64, pymysql, qrcode
from werkzeug.utils import secure_filename
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()
app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)
os.makedirs(os.path.join('static', 'uploads'), exist_ok=True)
app.config['UPLOAD_FOLDER'] = os.path.join('static', 'uploads')

def get_db():
    host = os.getenv('DB_HOST', 'localhost')
    use_ssl = {"fake_flag": True} if host not in ['localhost', '127.0.0.1'] else None
    
    return pymysql.connect(
        host=host,
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''),
        database=os.getenv('DB_NAME', 'test'),
        port=int(os.getenv('DB_PORT', 3306)), 
        cursorclass=pymysql.cursors.DictCursor,
        ssl=use_ssl 
    )

@app.route('/')
def index(): return render_template('index.html')

# --- AUTH Y RECOMPENSAS ---
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    nombre = data['nombre'].strip()
    documento = data['documento'].strip()
    email = data['email'].strip().lower()
    password = data['password'].strip()
    
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO usuarios (nombre, documento, email, password, puntos) VALUES (%s, %s, %s, %s, 5)", 
                           (nombre, documento, email, password))
        conn.commit()
        return jsonify({"success": True})
    except pymysql.IntegrityError as e:
        if 'documento' in str(e):
            return jsonify({"error": "El documento ya está registrado"}), 400
        return jsonify({"error": "El email ya está registrado"}), 400
    except Exception as e:
        return jsonify({"error": f"Error de BD: {str(e)}"}), 500
    finally: 
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data['email'].strip().lower()
    password = data['password'].strip()
    
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, nombre, rol FROM usuarios WHERE email=%s AND password=%s", (email, password))
            user = cursor.fetchone()
        conn.close()
        if user: return jsonify({"success": True, "user": user})
        else: return jsonify({"error": "Correo o contraseña incorrectos"}), 401
    except Exception as e:
        return jsonify({"error": f"Error del servidor: {str(e)}"}), 500

@app.route('/api/mis_puntos/<int:u_id>', methods=['GET'])
def mis_puntos(u_id):
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("SELECT puntos FROM usuarios WHERE id=%s", (u_id,))
        user = cursor.fetchone()
    conn.close()
    return jsonify({"puntos": user['puntos'] if user else 0})

# --- ADMIN: ESTADÍSTICAS Y VALIDACIÓN ---
@app.route('/api/admin/stats', methods=['GET'])
def admin_stats():
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT SUM(t.total) as ingresos, COUNT(d.id) as boletos 
            FROM tiquetes t LEFT JOIN detalle_tiquete_asientos d ON t.id = d.tiquete_id 
            WHERE t.estado IN ('activo', 'usado')
        """)
        tiquetes = cursor.fetchone()
        cursor.execute("SELECT COUNT(id) as total_funciones FROM funciones")
        funciones = cursor.fetchone()
    conn.close()
    ingresos = tiquetes['ingresos'] or 0
    boletos = tiquetes['boletos'] or 0
    t_func = funciones['total_funciones'] or 0
    ocupacion = (boletos / (t_func * 150)) * 100 if t_func > 0 else 0
    return jsonify({"ingresos": float(ingresos), "boletos": boletos, "ocupacion": round(ocupacion, 1)})

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

# --- ADMIN: PELÍCULAS ---
@app.route('/api/peliculas', methods=['GET'])
def get_all_peliculas():
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM peliculas") 
        datos = cursor.fetchall()
    conn.close()
    return jsonify(datos)

@app.route('/api/admin/peliculas', methods=['POST'])
def add_pelicula():
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            imagen = request.files.get('imagen')
            filename = secure_filename(imagen.filename) if imagen else ""
            if imagen: imagen.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            cursor.execute("INSERT INTO peliculas (titulo, sinopsis, clasificacion, duracion, actores, imagen, formato) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                           (request.form['titulo'], request.form['sinopsis'], request.form['clasificacion'], request.form['duracion'], request.form['actores'], filename, request.form.get('formato', '2D')))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals() and conn.open: conn.close()

@app.route('/api/admin/peliculas/<int:id>', methods=['PUT'])
def edit_pelicula(id):
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            imagen = request.files.get('imagen')
            if imagen:
                filename = secure_filename(imagen.filename)
                imagen.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                cursor.execute("UPDATE peliculas SET titulo=%s, sinopsis=%s, clasificacion=%s, duracion=%s, actores=%s, imagen=%s, formato=%s WHERE id=%s",
                               (request.form['titulo'], request.form['sinopsis'], request.form['clasificacion'], request.form['duracion'], request.form['actores'], filename, request.form.get('formato', '2D'), id))
            else:
                cursor.execute("UPDATE peliculas SET titulo=%s, sinopsis=%s, clasificacion=%s, duracion=%s, actores=%s, formato=%s WHERE id=%s",
                               (request.form['titulo'], request.form['sinopsis'], request.form['clasificacion'], request.form['duracion'], request.form['actores'], request.form.get('formato', '2D'), id))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals() and conn.open: conn.close()

@app.route('/api/admin/peliculas/<int:id>', methods=['DELETE'])
def delete_pelicula(id):
    conn = get_db()
    try:
        conn.begin()
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM funciones WHERE pelicula_id=%s", (id,))
            funciones = cursor.fetchall()
            if funciones:
                funciones_ids = [str(f['id']) for f in funciones]
                placeholders_f = ','.join(['%s'] * len(funciones_ids))
                cursor.execute(f"SELECT id FROM tiquetes WHERE funcion_id IN ({placeholders_f})", funciones_ids)
                tiquetes = cursor.fetchall()
                if tiquetes:
                    tiquetes_ids = [str(t['id']) for t in tiquetes]
                    placeholders_t = ','.join(['%s'] * len(tiquetes_ids))
                    cursor.execute(f"DELETE FROM detalle_tiquete_asientos WHERE tiquete_id IN ({placeholders_t})", tiquetes_ids)
                    cursor.execute(f"DELETE FROM tiquetes WHERE id IN ({placeholders_t})", tiquetes_ids)
                cursor.execute(f"DELETE FROM funciones WHERE id IN ({placeholders_f})", funciones_ids)
            cursor.execute("DELETE FROM peliculas WHERE id=%s", (id,))
        conn.commit()
        return jsonify({"success": True, "mensaje": "Película eliminada con éxito."})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Error al eliminar: {str(e)}"}), 500
    finally:
        if 'conn' in locals() and conn.open: conn.close()

# --- ADMIN: FUNCIONES ---
@app.route('/api/admin/funciones_lista', methods=['GET'])
def get_admin_funciones():
    conn = get_db()
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT f.id, f.fecha, f.hora, f.precio_base, p.titulo,
                   (SELECT COUNT(*) FROM tiquetes t JOIN detalle_tiquete_asientos dta ON t.id = dta.tiquete_id WHERE t.funcion_id = f.id) as ocupados
            FROM funciones f JOIN peliculas p ON f.pelicula_id = p.id ORDER BY f.fecha DESC, f.hora DESC
        """)
        datos = cursor.fetchall()
    for d in datos:
        if d['hora']: d['hora'] = str(d['hora'])
        if d['fecha']: d['fecha'] = str(d['fecha'])
        if d['precio_base']: d['precio_base'] = float(d['precio_base'])
    conn.close()
    return jsonify(datos)

@app.route('/api/admin/funciones', methods=['POST'])
def add_funcion():
    data = request.json
    try:
        hora_input = data['hora']
        if len(hora_input) == 5: hora_input += ":00"
        
        fecha_funcion = datetime.strptime(f"{data['fecha']} {hora_input}", "%Y-%m-%d %H:%M:%S")
        if fecha_funcion < datetime.now():
            return jsonify({"error": "No puedes programar funciones en el pasado."}), 400

        conn = get_db()
        with conn.cursor() as cursor:
            cursor.execute("SELECT duracion FROM peliculas WHERE id=%s", (data['pelicula_id'],))
            peli_nueva = cursor.fetchone()
            if not peli_nueva: return jsonify({"error": "Película no encontrada."}), 400
            
            duracion_nueva = peli_nueva['duracion']
            inicio_nuevo = datetime.strptime(hora_input, "%H:%M:%S")
            fin_nuevo = inicio_nuevo + timedelta(minutes=duracion_nueva + 20)

            cursor.execute("SELECT f.hora, p.duracion, p.titulo FROM funciones f JOIN peliculas p ON f.pelicula_id = p.id WHERE f.fecha=%s", (data['fecha'],))
            funciones_dia = cursor.fetchall()

            for f in funciones_dia:
                if isinstance(f['hora'], timedelta): inicio_ex = datetime.strptime("00:00:00", "%H:%M:%S") + f['hora']
                else:
                    hora_str = str(f['hora'])
                    if len(hora_str) == 5: hora_str += ":00"
                    inicio_ex = datetime.strptime(hora_str, "%H:%M:%S")
                fin_ex = inicio_ex + timedelta(minutes=f['duracion'] + 20)

                if inicio_nuevo < fin_ex and fin_nuevo > inicio_ex:
                    return jsonify({"error": f"Choque de horarios. La sala está ocupada con '{f['titulo']}' de {inicio_ex.strftime('%H:%M')} a {fin_ex.strftime('%H:%M')}."}), 400

            cursor.execute("INSERT INTO funciones (pelicula_id, fecha, hora, precio_base) VALUES (%s, %s, %s, %s)",
                           (data['pelicula_id'], data['fecha'], data['hora'], data['precio_base']))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals() and conn.open: conn.close()

@app.route('/api/admin/funciones/<int:id>', methods=['PUT'])
def edit_funcion(id):
    data = request.json
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            cursor.execute("UPDATE funciones SET pelicula_id=%s, fecha=%s, hora=%s, precio_base=%s WHERE id=%s",
                           (data['pelicula_id'], data['fecha'], data['hora'], data['precio_base'], id))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals() and conn.open: conn.close()

@app.route('/api/admin/funciones/<int:id>', methods=['DELETE'])
def delete_funcion(id):
    conn = get_db()
    try:
        conn.begin()
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM tiquetes WHERE funcion_id=%s", (id,))
            tiquetes = cursor.fetchall()
            if tiquetes:
                tiquetes_ids = [str(t['id']) for t in tiquetes]
                placeholders = ','.join(['%s'] * len(tiquetes_ids))
                cursor.execute(f"DELETE FROM detalle_tiquete_asientos WHERE tiquete_id IN ({placeholders})", tiquetes_ids)
                cursor.execute(f"DELETE FROM tiquetes WHERE id IN ({placeholders})", tiquetes_ids)
            cursor.execute("DELETE FROM funciones WHERE id=%s", (id,))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals() and conn.open: conn.close()

# --- ADMIN: CONFITERÍA ---
@app.route('/api/admin/confiteria', methods=['POST'])
def add_confiteria():
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            imagen = request.files.get('imagen')
            filename = secure_filename(imagen.filename) if imagen else ""
            if imagen: imagen.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            cursor.execute("INSERT INTO confiteria (nombre, precio, imagen) VALUES (%s, %s, %s)",
                           (request.form['nombre'], request.form['precio'], filename))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals() and conn.open: conn.close()

@app.route('/api/admin/confiteria/<int:id>', methods=['PUT'])
def edit_confiteria(id):
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            imagen = request.files.get('imagen')
            if imagen:
                filename = secure_filename(imagen.filename)
                imagen.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                cursor.execute("UPDATE confiteria SET nombre=%s, precio=%s, imagen=%s WHERE id=%s",
                               (request.form['nombre'], request.form['precio'], filename, id))
            else:
                cursor.execute("UPDATE confiteria SET nombre=%s, precio=%s WHERE id=%s",
                               (request.form['nombre'], request.form['precio'], id))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals() and conn.open: conn.close()

@app.route('/api/admin/confiteria/<int:id>', methods=['DELETE'])
def delete_confiteria(id):
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM confiteria WHERE id=%s", (id,))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals() and conn.open: conn.close()

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
        cursor.execute("""
            SELECT p.*, f.id as funcion_id, f.fecha, f.hora, f.precio_base 
            FROM peliculas p LEFT JOIN funciones f ON p.id = f.pelicula_id AND CONCAT(f.fecha, ' ', f.hora) >= NOW()
        """)
        datos = cursor.fetchall()
    for d in datos: 
        if d['hora']: d['hora'] = str(d['hora'])
        if d['fecha']: d['fecha'] = str(d['fecha'])
        if d['precio_base']: d['precio_base'] = float(d['precio_base'])
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
            SELECT t.id, t.codigo_validacion, t.codigo_qr, t.total, t.estado, f.fecha, f.hora, p.titulo, p.imagen,
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
            
            puntos_ganados = int(data['total'] // 50000)
            if puntos_ganados > 0:
                cursor.execute("UPDATE usuarios SET puntos = puntos + %s WHERE id = %s", (puntos_ganados, data['usuario_id']))

            qr = qrcode.make(qr_text)
            buf = io.BytesIO()
            qr.save(buf, format="PNG")
        conn.commit()
        return jsonify({"success": True, "qr": f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}", "codigo": cod_val, "asientos": sillas, "puntos_ganados": puntos_ganados})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally: conn.close()

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 3000))
    app.run(host='0.0.0.0', port=port)