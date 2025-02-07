//required libraries
import { WebSocketServer } from "ws";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
var mysql = require("mysql");

//initialiaze the socket server
const wss = new WebSocketServer({ port: 8080 });

//connect with the database
var dbcon = connectDB();

//on connection event
wss.on("connection", function connection(client) {
  //on message event
  client.on("message", function message(data) {
    console.log("Message received: ", data.toString());
    var message = "";
    var userData = data.toString().split("|-+-|");
    if (userData.length > 2) {
      message = userData[0].toString().split("|==|");
    } else {
      message = data.toString().split("|==|");
    }
    if (message.length >= 1) {
      var functionName = message[0];
      if (functionName === "GetUserData") {
        GetUserData(client, message[1]);
      }

      //extra functions
    }
  });
});

function connectDB() {
  var dbCon = mysql.createPool({
    connectionLimit: 50,
    host: "localhost",
    user: "root",
    password: "1234",
    database: "testdb",
    charset: "utf8mb4",
  });
  return dbCon;
}

//select user data and send it to the client. THIS IS JUST AN EXAMPLE...
function GetUserData(client, userID) {
  //this sends a message back to client
  var replyData = {};
  replyData["Function"] = "GetUserDataReply";
  replyData["Data"] = [
    JSON.stringify({
      upgradeList: [
        { code: 0, number: 1 },
        { code: 1, number: 1 },
      ],
    }),
  ];
  replyData["Data"].push(0);
  replyData["Data"].push(0);
  replyData["Data"].push(
    JSON.stringify({
      achievementList: [
        { code: 0, number: 1 },
        { code: 1, number: 1 },
      ],
    })
  );
  client.send(JSON.stringify(replyData));
}
