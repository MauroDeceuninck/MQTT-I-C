const express = require('express');
const http = require('http');
const i2c = require('i2c-bus');
const mqtt = require('mqtt');
const socketIO = require('socket.io');
const IoTHubClient = require('azure-iot-device').Client;
const Message = require('azure-iot-device').Message;
const Protocol = require('azure-iot-device-mqtt').Mqtt;

const app = express();
const server = http.createServer(app);

// Serveer statische bestanden vanuit de 'public' map
app.use(express.static('public'));

const TC74_ADDR = 0x48;
const TEMP_REG = 0x00;

let i2c1; // Declareer i2c1 in de module scope
let TempData;

// Zet Socket.io op
const io = socketIO(server);

// Verbindingsgebeurtenis voor Socket.io
io.on('connection', (socket) => {
  console.log('Een gebruiker heeft verbonden');
});

/* GET home page. */
app.get('/', function (req, res, next) {
  res.sendFile(__dirname + '/public/index.html');
});

// Start de server op poort 3000
server.listen(3000, () => {
  console.log('De server draait op http://patje.local:3000');
});

// MQTT-verbinding
const client = mqtt.connect("ws://192.168.0.163:9001");

client.on("connect", () => {
  console.log("MQTT verbonden");
  client.subscribe("Temperature", (err) => {
    if (!err) {
      console.log("Geabonneerd op het Temperature-onderwerp");
    }
  });
});

// Azure IoT Hub-verbindingssnaar
const iotHubConnectionString = 'HostName=IoTHub-TC74.azure-devices.net;DeviceId=TC74TempSensor;SharedAccessKey=ifLTh9SGcMUPJ9ODMWj85qr1uFuONqgENAIoTEUx++E=';

// Maak een Azure IoT Hub-client
const iotHubClient = IoTHubClient.fromConnectionString(iotHubConnectionString, Protocol);

// Functie om de temperatuur te lezen, uit te zenden en te publiceren
function readAndEmitTemperature() {
  i2c.openPromisified(1)
    .then((_i2c1) => {
      i2c1 = _i2c1; // Wijs _i2c1 toe aan de module-scoped i2c1-variabele
      return i2c1.readByte(TC74_ADDR, TEMP_REG);
    })
    .then(rawData => {
      console.log(`rawData: ${rawData}`);
      TempData = rawData;

      // Zend de bijgewerkte temperatuurwaarde naar alle verbonden clients
      io.emit('temperature', TempData);

      // Publiceer temperatuur naar MQTT
      client.publish("Temperature", TempData.toString());

      // Zend temperatuur naar Azure IoT Hub
      const message = new Message(JSON.stringify({ temperature: TempData }));
      iotHubClient.sendEvent(message, (err, result) => {
        if (err) {
          console.error('Fout bij het verzenden van het bericht naar Azure IoT Hub:', err.toString());
        } else {
          console.log('Bericht verzonden naar Azure IoT Hub:', message.getData());
        }
      });
    })
    .then(() => i2c1.close()) // Verplaats de close-oproep naar een apart then-blok
    .catch(console.log);
}

// Periodiek de temperatuur lezen, uitzenden en publiceren (elke 5 seconden in dit voorbeeld)
setInterval(readAndEmitTemperature, 5000);




