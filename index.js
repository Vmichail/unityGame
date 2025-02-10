/**
 * Banana Clicker Prototype Game Backend Service
 *
 * WebSocket server handling game logic, user data management, and users achievements.
 * Uses MySQL for persistent storage and WebSockets for real-time communication and in server memory for users achievements.
 *
 * Author: Vasilis Michail
 * Version: 1.0.0
 */

import { WebSocketServer } from "ws";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const mysql = require("mysql");
const wss = new WebSocketServer({ port: 8080 });
const dbcon = connectDB();

//Achievements constants
const updatesAchievementMilestones = [1, 3, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72];
const upgradesAchievementCode = 1;
const bananaClickedAchievementCode = 0;
const bananaClickedAcievementTiers = [
  { threshold: 100, divisor: 10 },
  { threshold: 500, divisor: 50 },
  { threshold: 1000, divisor: 100 },
  { threshold: 5000, divisor: 500 },
  { threshold: 10000, divisor: 1000 },
];
const userAchievementsInfo = new Map();

const maxUpgradeCount = 36;

function connectDB() {
  const dbCon = mysql.createPool({
    connectionLimit: 50,
    host: "localhost",
    user: "vmichail",
    password: "1234",
    database: "testdb",
    charset: "utf8mb4",
  });
  return dbCon;
}

wss.on("connection", (client) => {
  client.on("message", (data) => {
    let message = "";
    const userData = data.toString().split("|-+-|");
    if (userData.length > 2) {
      message = userData[0].toString().split("|==|");
    } else {
      message = data.toString().split("|==|");
    }
    if (message.length >= 1) {
      const functionName = message[0];
      if (handlers[functionName]) {
        handlers[functionName](client, message);
      } else {
        client.send(
          JSON.stringify({
            Function: functionName + "Reply",
            Data: ["Unknown function name"],
          })
        );
      }
    }
  });
});

/**
 * Object that stores in server memory the achievements of the user
 * @param {string} userID
 * @returns
 */
function getUserAchievements(userID) {
  if (!userAchievementsInfo.has(userID)) {
    userAchievementsInfo.set(userID, {
      totalBananasClickedMilestones: 0,
      totalUpgradesMilestone: 0,
      achievements: [
        { code: 0, number: 0 },
        { code: 1, number: 0 },
      ],
    });
  }
  return userAchievementsInfo.get(userID);
}

/**
 * Handler object that validates received messages and calls the appropriate function
 */
const handlers = {
  GetUserData: (client, message) => {
    const validationError = validateReceivedMessage(message, 4, ["string", "string", "string", "boolean"]);
    if (validationError) {
      client.send(JSON.stringify({ Function: GetUserData.name + "Reply", Data: [validationError] }));
      return;
    }
    GetUserData(client, message[1]);
  },
  ChangeLanguage: (client, message) => {
    const validationError = validateReceivedMessage(message, 4, ["string", "string", "string", "number"]);
    if (validationError) {
      client.send(JSON.stringify({ Function: ChangeLanguage.name + "Reply", Data: [validationError] }));
      return;
    }
    ChangeLanguage(client, message[1], message[3]);
  },
  Upgrade: (client, message) => {
    const validationError = validateReceivedMessage(message, 4, ["string", "string", "string", "number"]);
    if (validationError) {
      client.send(JSON.stringify({ Function: Upgrade.name + "Reply", Data: [validationError] }));
      return;
    }
    Upgrade(client, message[1], message[3]);
  },
  BananaClicked: (client, message) => {
    const validationError = validateReceivedMessage(message, 3, ["string", "string", "string"]);
    if (validationError) {
      client.send(JSON.stringify({ Function: BananaClicked.name + "Reply", Data: [validationError] }));
      return;
    }
    BananaClicked(client, message[1]);
  },
};

/**
 * Validates the message received from the client
 * @param {string,number,boolean} message
 * @param {string} expectedParamsTypes
 * @returns
 */
function validateReceivedMessage(message, minLength, expectedParamsTypes) {
  if (message.length < minLength) {
    return `Expected at least ${minLength} parameters, but got ${message.length}.`;
  }
  let passedCheck = true;
  for (let i = 0; i < expectedParamsTypes.length; i++) {
    const receivedParam = message[i];
    if (expectedParamsTypes[i] === "number" && isNaN(Number(receivedParam))) {
      passedCheck = false;
    } else if (expectedParamsTypes[i] === "boolean" && !["true", "false"].includes(receivedParam.toLowerCase())) {
      passedCheck = false;
    } else if (expectedParamsTypes[i] === "string" && typeof receivedParam !== expectedParamsTypes[i]) {
      passedCheck = false;
    }
    if (!passedCheck) {
      return `Expected parameter ${receivedParam} to be of type ${expectedParamsTypes[i]}, but got ${typeof receivedParam}.`;
    }
  }
  return null;
}

/**
 * Checks if user exists in database and sends the data to the client
 * If the user does not exist, it creates a new user with default values
 * @param {WebSocket} client
 * @param {string} userID
 */
function GetUserData(client, userID) {
  dbcon.query("SELECT upgrades,gold,language FROM users WHERE userID = ?", [userID], function (err, result) {
    if (err) {
      client.send(commonReplyToClient(GetUserData.name, err));
      return;
    }

    if (result.length === 0) {
      result = createUser(client, userID, result);
    }

    const achievementsInfo = getUserAchievements(userID);

    const replyData = {
      Function: GetUserData.name + "Reply",
      Data: [
        JSON.stringify({
          upgradeList: JSON.parse(result[0].upgrades),
        }),
        result[0].gold,
        result[0].language,
        JSON.stringify({
          achievementList: achievementsInfo.achievements,
        }),
      ],
    };
    client.send(JSON.stringify(replyData));
  });
}

function createUser(client, userID, result) {
  insertDefaultUserData(client, userID);
  result = [
    {
      upgrades: JSON.stringify([
        { code: 0, number: 0 },
        { code: 1, number: 0 },
      ]),
      gold: 0,
      language: 0,
    },
  ];
  return result;
}

function insertDefaultUserData(client, userID) {
  dbcon.query(
    "INSERT INTO users (userID, upgrades, gold, language) VALUES (?, ?, ?, ?)",
    [
      userID,
      JSON.stringify([
        { code: 0, number: 0 },
        { code: 1, number: 0 },
      ]),
      0,
      0,
    ],
    function (err) {
      if (err) {
        client.send(commonReplyToClient(GetUserData.name, err));
      }
    }
  );
}

/**
 * Updates the language of the user
 * @param {WebSocket} client
 * @param {string} userID
 * @param {number} languageIndex
 */
function ChangeLanguage(client, userID, languageIndex) {
  dbcon.query("UPDATE users SET language = ? WHERE userID = ?", [languageIndex, userID], function (err) {
    client.send(commonReplyToClient(ChangeLanguage.name, err));
  });
}

/**
 * Updates the number of upgrades of the user and the remaining gold
 * Checks if user update meets a milestone and updates the upgrade achievements
 * @param {WebSocket} client
 * @param {string} userID
 * @param {number} upgradeCode
 */
function Upgrade(client, userID, upgradeCode) {
  dbcon.query("SELECT gold, upgrades FROM users WHERE userID = ?", [userID], function (err, result) {
    if (err || result.length === 0) {
      client.send(commonReplyToClient(Upgrade.name, err ? err : "Result length is 0"));
      return;
    }

    let userGold = result[0].gold;
    const upgrades = JSON.parse(result[0].upgrades);
    const upgradeCount = upgrades[upgradeCode].number + 1;
    if (upgradeCount > maxUpgradeCount || upgradeCode < 0) {
      client.send(
        commonReplyToClient(Upgrade.name, `Max upgrade is${maxUpgradeCount} but ${upgradeCode} found on user:${userID}`)
      );
      return;
    }
    const cost = calculateUpgradeCost(upgradeCount);

    if (userGold < cost) {
      client.send(commonReplyToClient(Upgrade.name, `Not enough gold - UpdateCost:${cost} - UserGold:${userGold}`));
      return;
    }

    upgrades[upgradeCode].number += 1;
    userGold -= cost;

    const allAchievementInfos = getUserAchievements(userID);
    const upgradesAchievement = allAchievementInfos.achievements.find((ach) => ach.code === upgradesAchievementCode);
    upgradesAchievement.number += 1;
    unlockUpdatesAchievements(allAchievementInfos, upgradesAchievement.number);

    dbcon.query(
      "UPDATE users SET gold = ?, upgrades = ? WHERE userID = ?",
      [userGold, JSON.stringify(upgrades), userID],
      function (err) {
        client.send(commonReplyToClient(Upgrade.name, err));
      }
    );
  });
}

function unlockUpdatesAchievements(achievementInfo, achievementNumber) {
  if (updatesAchievementMilestones.includes(achievementNumber)) {
    achievementInfo.totalUpgradesMilestone += 1;
  }
}

function calculateUpgradeCost(upgradeCount) {
  if (upgradeCount <= 10) return 10 * upgradeCount;
  if (upgradeCount <= 18) return 100 + 50 * (upgradeCount % 10);
  if (upgradeCount <= 23) return 500 + 100 * (upgradeCount % 18);
  if (upgradeCount <= 31) return 1000 + 500 * (upgradeCount % 23);
  return 5000 + 1000 * (upgradeCount % 31);
}

/**
 * Updates the gold of the user on the banana click
 * and checks if the user has reached a milestone
 * @param {WebSocket} client
 * @param {string} userID
 */
function BananaClicked(client, userID) {
  dbcon.query("SELECT gold, upgrades FROM users WHERE userID = ?", [userID], function (err, result) {
    if (err || result.length === 0) {
      client.send(commonReplyToClient(BananaClicked.name, err ? err : "Result length is 0"));
      return;
    }
    let userGold = result[0].gold;
    const upgrades = JSON.parse(result[0].upgrades);
    const allAchievementInfos = getUserAchievements(userID);
    const clickedBananaMilestones = allAchievementInfos.totalBananasClickedMilestones;
    const clickedAchievementMilestones = allAchievementInfos.totalUpgradesMilestone;
    const bananaClickedAchievement = allAchievementInfos.achievements.find((ach) => ach.code === bananaClickedAchievementCode);

    bananaClickedAchievement.number++;
    unlockBananaClickAchievements(allAchievementInfos, bananaClickedAchievement.number);

    userGold += 1 + upgrades[0].number + clickedBananaMilestones + clickedAchievementMilestones;

    dbcon.query("UPDATE users SET gold = ? WHERE userID = ?", [userGold, userID], function (err) {
      client.send(commonReplyToClient(BananaClicked.name, err));
    });
  });
}

/**
 * Checks if totalBananasClicked meets a milestone and updates the banana click achievement
 * @param {*} achievementsInfo
 * @param {number} totalBananasClicked
 */
function unlockBananaClickAchievements(achievementsInfo, totalBananasClicked) {
  for (const tier of bananaClickedAcievementTiers) {
    if (totalBananasClicked <= tier.threshold && totalBananasClicked % tier.divisor === 0) {
      achievementsInfo.totalBananasClickedMilestones += 1;
      break;
    }
  }
}

function commonReplyToClient(functionName, error) {
  return JSON.stringify({
    Function: functionName + "Reply",
    Data: [error ? error : "true"],
  });
}
