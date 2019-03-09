const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const multer = require('multer');
const storage = multer.diskStorage({
    destination: 'upload/',
    filename: function(req, file, cb) {
        cb(null, file.originalname)
    }
})

const upload = multer({ storage: storage });

const app = express();

/**
 * Certificado para conexiones SSL
 */
var SSLPrivateKey = fs.readFileSync('./keys/SSL/cert-key.key', 'utf8');
var SSLCertificate = fs.readFileSync('./keys/SSL/certificate.pem', 'utf8');
var credentials = {
    key: SSLPrivateKey,
    cert: SSLCertificate
};

/**
 * Configurar Headers para CORS
 */
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

/**
 * Configurar middleware para peticiones POST
 */
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

/**
 * Configuracion de MySQL
 */
var mysql_conf = [];
var conexion;
try {
    fs.readFile(__dirname + '/db.conf', (err, data) => {
        if (err) {
            throw err;
        }
        mysql_conf = JSON.parse(data);
        conexion = mysql.createConnection({
            host: mysql_conf.host,
            user: mysql_conf.user,
            password: mysql_conf.password,
            database: mysql_conf.db,
            multipleStatements: true
        });
    });
} catch (err) {
    console.error(err);
}

/**
 * Ruta para extraer todas las capas de la base de datos
 */
app.route('/api/layers').get((req, res) => {
    var queryText = "SELECT * FROM Layers;";
    try {
        conexion.query(queryText, (err, results) => {});
    } catch (err) {
        res.json({
            "err": err,
            "statusText": "failure",
            "ok": false,
            "message": "Ocurrio un error inesperado"
        });
    }
});

/**
 * Ruta para insertar datos de una capa nueva en la BD
 */
app.post('/api/layers', upload.single('layerUpload'), (req, res, next) => {
    var layerParams = req.body;
    var fileParams = req.file;
    var queryInsert = "INSERT INTO capas (Archivo,Nombre,Tipo,Color) VALUES (?,?,?,?)";
    try {
        conexion.query(
            queryInsert, [fileParams.filename, layerParams.layerName, layerParams.layerType, layerParams.layerColor],
            (errors, results) => {
                if (errors !== null) {
                    return res.status(500).json({ 'errorsBD': errros, 'status': 'Fail' });
                } else {
                    // createObjectCapa(fileParams.path, layerParams);


                    /* Definimos el tipo de capa a dibujar */
                    let type = 'line';
                    let typeData = 'Feature';
                    if (layerParams.layerType == 'Puntos') {
                        type = 'symbol';
                        typeData = 'FeatureCollection';
                    }

                    /* Creamos objeto contenedor */
                    let layerData = {};

                    /* Definimos atributos adicionales de la capa */
                    let layout = {};
                    let paint = {};
                    if (layerParams.layerType == 'Puntos') {
                        layerData = {
                            "layer": {
                                'id': layerParams.layerName,
                                'type': type,
                                'source': {
                                    'type': 'geojson',
                                    'data': {
                                        'type': 'FeatureCollection',
                                        'features': []
                                    }
                                },
                                'layout': {
                                    'icon-image': '{icon}-15',
                                    'text-field': '{title}',
                                    'text-font': ['Open Sans Semibold'],
                                    'text-offset': [0, 0.6],
                                    'text-anchor': 'top'
                                }
                            }
                        };
                    } else {
                        layerData = {
                            "layer": {
                                'id': layerParams.layerName,
                                'type': type,
                                'source': {
                                    'type': 'geojson',
                                    'data': {
                                        'type': 'FeatureCollection',
                                        'features': []
                                    }
                                },
                                'layout': {
                                    'line-join': 'round',
                                    'line-cap': 'round'
                                },
                                'paint': {
                                    'line-color': layerParams.layerColor,
                                    'line-width': 1
                                }
                            }
                        };
                    }

                    /* Leemos datos geograficos desde el archivo */
                    fs.readFile(__dirname + '/' + fileParams.path, (err, data) => {
                        if (err) {
                            throw err;
                        }

                        let fileData = JSON.parse(data);
                        let featuresInFile = fileData.features;

                        featuresInFile.forEach(element => {
                            layerData.layer.source.data.features.push(element);
                        });

                        console.log('JsonRes: ' + layerData);
                        return res.status(200).json({ 'infoBD': results, 'layerData': layerData, 'status': 'OK' });
                    });
                }
            });
    } catch (err) {
        res.json({
            "err": err,
            "statusText": "failure",
            "ok": false,
            "message": "Ocurrio un error al insertar los valores en la BD"
        });
    }
});

/**
 * Método para crear objeto JSON de capa
 */
function createObjectCapa(filePath, params) {
    try {
        /* Definimos el tipo de capa a dibujar */
        let type = 'line';
        let typeData = 'Feature';
        if (params.layerType == 'Puntos') {
            type = 'symbol';
            typeData = 'FeatureCollection';
        }

        /* Definimos atributos adicionales de la capa */
        let layerAttributes = {};
        if (params.layerType == 'Puntos') {
            layerAttributes = {
                'layout': {
                    'icon-image': '{icon}-15',
                    'text-field': '{title}',
                    'text-font': ['Open Sans Semibold'],
                    'text-offset': [0, 0.6],
                    'text-anchor': 'top'
                }
            };
        } else {
            layerAttributes = {
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#27e1e8',
                    'line-width': 1
                }
            };
        }

        /* Creamos objeto contenedor */
        let layerData = {
            "layer": {
                'id': params.layerName,
                'type': type,
                'source': {
                    'type': 'geojson',
                    'data': {
                        'type': 'FeatureCollection',
                        'features': []
                    }
                },
                layerAttributes
            }
        };

        /* Leemos datos geograficos desde el archivo */
        fs.readFile(__dirname + '/' + filePath, (err, data) => {
            if (err) {
                throw err;
            }

            let fileData = JSON.parse(data);
            let featuresInFile = fileData.features;

            featuresInFile.forEach(element => {
                layerData.layer.source.data.features.push(element);
            });

            return layerData;
        });
    } catch (err) {
        return { 'status': 'fail', 'errors': err };
    }
}

/**
 * Creacion de servidores HTTP y HTTPS
 */
var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);
httpServer.listen(8001, () => {
    console.log("HTTP Server Started");
});
httpsServer.listen(8444, () => {
    console.log("HTTPS Server Started");
});