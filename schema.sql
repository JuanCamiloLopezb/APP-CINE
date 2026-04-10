DROP DATABASE IF EXISTS cinex;
CREATE DATABASE cinex;
USE cinex;

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    rol VARCHAR(20) DEFAULT 'cliente'
);

CREATE TABLE peliculas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(150) NOT NULL,
    sinopsis TEXT,
    clasificacion VARCHAR(10),
    duracion INT NOT NULL, -- en minutos
    actores TEXT,
    imagen VARCHAR(255)
);

CREATE TABLE funciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pelicula_id INT,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    precio_base DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (pelicula_id) REFERENCES peliculas(id)
);

CREATE TABLE asientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero VARCHAR(5) NOT NULL
);

CREATE TABLE confiteria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100),
    precio DECIMAL(10,2),
    imagen VARCHAR(255)
);

CREATE TABLE tarjetas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    numero_enmascarado VARCHAR(20),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE tiquetes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_qr TEXT NOT NULL,
    codigo_validacion VARCHAR(10) UNIQUE NOT NULL,
    usuario_id INT,
    funcion_id INT,
    metodo_pago VARCHAR(50),
    total DECIMAL(10,2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'activo', -- activo, usado
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (funcion_id) REFERENCES funciones(id)
);

CREATE TABLE detalle_tiquete_asientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tiquete_id INT,
    asiento_id INT,
    FOREIGN KEY (tiquete_id) REFERENCES tiquetes(id),
    FOREIGN KEY (asiento_id) REFERENCES asientos(id)
);

-- Datos por defecto
INSERT INTO usuarios (nombre, email, password, rol) VALUES ('Administrador', 'admin@cinex.com', 'admin123', 'admin');
INSERT INTO confiteria (nombre, precio, imagen) VALUES 
('Combo Palomitas + Refresco', 25000, 'https://via.placeholder.com/100?text=Combo1'),
('Perro Caliente', 12000, 'https://via.placeholder.com/100?text=Perro'),
('Caja de Dulces', 8000, 'https://via.placeholder.com/100?text=Dulces');

-- Generar 150 asientos
DELIMITER $$
CREATE PROCEDURE GenerarAsientos()
BEGIN
    DECLARE i INT DEFAULT 1;
    WHILE i <= 150 DO
        INSERT INTO asientos (numero) VALUES (CONCAT('S', i));
        SET i = i + 1;
    END WHILE;
END$$
DELIMITER ;
CALL GenerarAsientos();