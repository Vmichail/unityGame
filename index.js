import { WebSocketServer } from "ws";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
var mysql = require("mysql");
const wss = new WebSocketServer({ port: 8080 });
var dbcon = connectDB();

const handlers = {
  GetUserData: (client, message) => GetUserData(client, message[1]),
  ChangeLanguage: (client, message) => ChangeLanguage(client, message[1], message[3]),
  Upgrade: (client, message) => Upgrade(client, message[1], message[3]),
  BananaClicked: (client, message) => BananaClicked(client, message[1]),
};

const updatesAchivementMilestones = [
  1, 3, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72,
];

const upgradesAchievementCode = 1,
  bananaClickedAchievementCode = 0;

const userAchievementsInfo = new Map();

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
  console.log(`Achievements for user ${userID}: ${JSON.stringify(userAchievementsInfo.get(userID))}`);
  return userAchievementsInfo.get(userID);
}

wss.on("connection", (client) => {
  client.on("message", (data) => {
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
      if (handlers[functionName]) {
        handlers[functionName](client, message);
      } else {
        console.error(`Unknown function: ${functionName}`);
      }
    }
  });
});

function connectDB() {
  var dbCon = mysql.createPool({
    connectionLimit: 50,
    host: "localhost",
    user: "vmichail",
    password: "1234",
    database: "testdb",
    charset: "utf8mb4",
  });
  return dbCon;
}

/**
 * Checks if you have a user in the database and sends the data to the client
 * If the user does not exist, it creates a new user with default values
 * @param {*} client
 * @param {String} userID is the user unique identifier
 */
function GetUserData(client, userID) {
  console.log("GetUserData called with userID: ", userID);
  dbcon.query("SELECT upgrades,gold,language FROM users WHERE userID = ?", [userID], function (err, result) {
    if (err) {
      console.error("Error fetching user data: ", err);
      return;
    }

    if (result.length === 0) {
      result = createUser(userID, result);
    }

    const achievementsInfo = getUserAchievements(userID);

    var replyData = {
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
    console.log(`${GetUserData.name} sent the following data to client:${JSON.stringify(replyData)}`);
    client.send(JSON.stringify(replyData));
  });
}

function createUser(userID, result) {
  insertDefaultUserData(userID);
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

function insertDefaultUserData(userID) {
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
    function (err, result) {
      if (err) {
        console.error("Error inserting default user data: ", err);
      } else {
        console.log(`Inserted default data for userID: ${userID}`);
      }
    }
  );
}

/**
 * Updates the language of the user
 * @param {*} client
 * @param {String} userID
 * @param {Number} languageIndex
 */
function ChangeLanguage(client, userID, languageIndex) {
  console.log("ChangeLanguage called with userID: ", userID, " and languageIndex: ", languageIndex);
  dbcon.query("UPDATE users SET language = ? WHERE userID = ?", [languageIndex, userID], function (err) {
    client.send(buildCommandReply(ChangeLanguage.name, err));
  });
}

/**
 * Updates the number of upgrades of the user and the remaining gold
 * Checks if user update meets a milestone and updates the upgrade achievements
 * @param {*} client
 * @param {*} userID
 * @param {*} upgradeCode
 */
function Upgrade(client, userID, upgradeCode) {
  console.log("Upgrade called with userID: ", userID, " and upgradeCode: ", upgradeCode);
  dbcon.query("SELECT gold, upgrades FROM users WHERE userID = ?", [userID], function (err, result) {
    if (err || result.length === 0) {
      console.log("Mphka sto error");
      buildCommandReply(Upgrade.name, err);
      return;
    }
    let userGold = result[0].gold;
    let upgrades = JSON.parse(result[0].upgrades);

    let upgradeCount = upgrades[upgradeCode].number + 1;
    let cost = calculateUpgradeCost(upgradeCount);

    if (userGold < cost) {
      client.send(JSON.stringify({ Function: "UpgradeReply", Data: ["false"] }));
      return;
    }

    upgrades[upgradeCode].number += 1;
    userGold -= cost;

    const allAchievementInfos = getUserAchievements(userID);
    let upgradesAchievement = allAchievementInfos.achievements.find((ach) => ach.code === upgradesAchievementCode);
    upgradesAchievement.number += 1;
    unlockUpdatesAchievements(allAchievementInfos, upgradesAchievement.number);

    dbcon.query(
      "UPDATE users SET gold = ?, upgrades = ? WHERE userID = ?",
      [userGold, JSON.stringify(upgrades), userID],
      function (err) {
        buildCommandReply(Upgrade.name, err);
      }
    );
  });
}

function unlockUpdatesAchievements(achievementInfo, achievementNumber) {
  if (updatesAchivementMilestones.includes(achievementNumber)) {
    achievementInfo.totalUpgradesMilestone += 1;
    console.log(`Milestones unlocked for Updates:  - ${achievementNumber}`);
  }
}

function calculateUpgradeCost(upgradeCount) {
  if (upgradeCount <= 10) {
    return 10 * upgradeCount;
  } else if (upgradeCount <= 20) {
    return 100 + 50 * (upgradeCount % 10);
  } else {
    return 1000 + 500 * (upgradeCount % 20);
  }
}

/**
 * Updates the gold of the user on the banana click
 * and checks if the user has reached a milestone
 * @param {*} client
 * @param {*} userID
 */
function BananaClicked(client, userID) {
  dbcon.query("SELECT gold, upgrades FROM users WHERE userID = ?", [userID], function (err, result) {
    if (err || result.length === 0) {
      client.send(JSON.stringify({ Function: "BananaClickedReply", Data: ["false"] }));
      return;
    }
    let userGold = result[0].gold;
    let upgrades = JSON.parse(result[0].upgrades);
    let bananaGold = 1 + upgrades[0].number;
    const allAchievementInfos = getUserAchievements(userID);
    let clickedBananaMilestones = allAchievementInfos.totalBananasClickedMilestones;
    let clickedAchievementMilestones = allAchievementInfos.totalUpgradesMilestone;
    let bananaClickedAchievement = allAchievementInfos.achievements.find(
      (ach) => ach.code === bananaClickedAchievementCode
    );
    bananaClickedAchievement.number++;
    unlockBananaClickAchievements(allAchievementInfos, bananaClickedAchievement.number);

    userGold += bananaGold + clickedBananaMilestones + clickedAchievementMilestones;

    dbcon.query("UPDATE users SET gold = ? WHERE userID = ?", [userGold, userID], function (err) {
      client.send(buildCommandReply(BananaClicked.name, err));
    });
  });
}

function unlockBananaClickAchievements(achievementsInfo, totalBananasClicked) {
  let updated = false;
  if (totalBananasClicked <= 100) {
    if (totalBananasClicked % 10 === 0) {
      achievementsInfo.totalBananasClickedMilestones += 1;
      updated = true;
    }
  } else if (totalBananasClicked <= 1000) {
    if (totalBananasClicked % 50 === 0) {
      achievementsInfo.totalBananasClickedMilestones += 1;
      updated = true;
    }
  } else if (totalBananasClicked <= 5000) {
    if (totalBananasClicked % 100 === 0) {
      achievementsInfo.totalBananasClickedMilestones += 1;
      updated = true;
    }
  } else if (totalBananasClicked <= 10000) {
    if (totalBananasClicked % 500 === 0) {
      achievementsInfo.totalBananasClickedMilestones += 1;
      updated = true;
    }
  }
  if (updated) {
    console.log(`Achievement unlocked: bananaAchivement.code - ${totalBananasClicked}`);
  }
}

function buildCommandReply(functionName, err) {
  return JSON.stringify({
    Function: functionName + "Reply",
    Data: [err ? "false" : "true"],
  });
}
