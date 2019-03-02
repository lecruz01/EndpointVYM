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
    console.log(req.file);
    console.log(req.body);
    // let uploaded = JSON.parse(fs.readFileSync('upload/' + req.file['filename']));
    return res.status(200).json({ 'status': 'OK' });
});

/**
 * Ruta para insertar un registro a tabla de suscriptores
 */
app.route('/api/subscribers').post((req, res) => {
    var params = req.body;
    var queryText = "CALL CreateNewSubscriber('" +
        params.endpoint + "','" +
        params.expirationTime + "','" +
        params.keys.p256dh + "','" +
        params.keys.auth + "',@newID); SELECT @newID; SELECT * FROM Subscribers WHERE ID=@newID;";
    try {
        // console.log(queryText);
        conexion.query(queryText, (err, results) => {
            if (err) throw err;
            var notificationPayload = {
                "notification": {
                    "title": "Xcaret Newsletter",
                    "body": "Gracias por suscribirte a nuestro newsletter",
                    "icon": "assets/main-page-logo-small-hat.png",
                    "vibrate": [100, 50, 100],
                    "data": {
                        "dateOfArrival": Date.now(),
                        "primaryKey": 1
                    }
                }
            };
            var datos = results[2];
            // console.log(datos);
            var subs = [{
                "endpoint": datos.endpoint,
                "expirationTime": datos.expirationTime,
                "keys": {
                    "p256dh": datos.P256DH,
                    "auth": datos.auth
                }
            }];
            // console.log("Sub: " + subs);
            Promise.all(subs.map(sub => webpush.sendNotification(
                    sub, JSON.stringify(notificationPayload))))
                .then(() => res.json({ message: 'Bienvenida enviada.' }))
                .catch(err => {
                    res.json({
                        err: err,
                        message: "Error al enviar notificación"
                    });
                });
        });
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