const fs = require("fs");
const readline = require("readline");
const spawn = require("child_process").spawn;
var cron = require("node-cron");
const http = require("http");
const doConvert = require("./convert/SSExtract").doConvert;
require("dotenv").config();

const token = process.env.TOKEN;
let isChecking = false;

async function processLineByLine(filePath) {
  const fileStream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  // Note: we use the crlfDelay option to recognize all instances of CR LF
  // ('\r\n') in input.txt as a single line break.

  const lines = [];
  for await (const line of rl) {
    lines.push(line);
  }

  return lines;
}

const spawnTest = async (url, last = false) => {
  return new Promise((resolve, reject) => {
    fs.chmodSync(__dirname + `/lite/lite`, 0o777);
    // spawn(`bash -c "chmod 777 ${__dirname}/lite/lite"`);
    let ls = spawn(`bash -c "${__dirname}/lite/lite --config config.json --test ${url}"`, { shell: true, cwd: __dirname + "/lite" });
    ls.on("error", function (err) {
      console.log("ls error", err);
    });

    ls.stdout.on("data", function (data) {
      console.log("stdout: " + data);
    });

    ls.stderr.on("data", function (data) {
      // console.log("stderr: " + data);
    });

    ls.on("close", async function (code) {
      console.log("Checking Urls Proxies exited with code " + code + ` , url : ${url}`);
      if (code == 0) {
        console.log("code is 0", last);
        const result = await fs.readFile(__dirname + "/lite/output.txt", "utf-8", async (err, data) => {
          if (err) throw err;

          fs.writeFile(__dirname + "/proxies.txt", data, { flag: "a" }, async (error) => {
            if (error) {
              console.log("file write error", error);
              reject();
            } else {
              console.log("File written");
            }
          });
        });
      } else {
        console.log("rejected");
        reject();
      }
      if (last == true) {
        fs.readFile(__dirname + "/proxies.txt", "utf-8", async (err, data) => {
          if (err) throw err;
          const results = doConvert(data);
          fs.readFile(__dirname + "/clashConfig.txt", "utf-8", async (err, headers) => {
            if (err) throw err;
            fs.writeFile(__dirname + "/clash.yaml", headers, (error) => {
              if (error) throw error;
              fs.writeFile(__dirname + "/clash.yaml", results || "", { flag: "a" }, (error) => {
                if (error) throw error;
                let gitpush = spawn(`git add . && git commit -m "updateProxies" && git push https://${token}@github.com/4lirexa/ProxyCheckerArm HEAD`, { shell: true, cwd: __dirname });
                gitpush.on("error", function (err) {
                  console.log("gitpush error", err);
                  reject();
                });

                gitpush.stdout.on("data", function (data) {
                  console.log("stdout: " + data);
                });

                gitpush.stderr.on("data", function (data) {
                  console.log("stderr: " + data);
                });

                gitpush.on("close", (code) => {
                  resolve();
                  console.log("finished all promises");
                  console.log("git push exited with code " + code);
                  isChecking = false;
                });
              });
            });
          });
        });
      } else {
        resolve();
      }
    });
  });
};

async function getNodes() {
  let gitpull = spawn(`git stash && git pull https://${token}@github.com/4lirexa/ProxyCheckerArm main`, { shell: true, cwd: __dirname });
  gitpull.on("error", function (err) {
    console.log("gitpull error", err);
  });

  gitpull.stdout.on("data", function (data) {
    console.log("stdout: " + data);
  });

  gitpull.stderr.on("data", function (data) {
    console.log("stderr: " + data);
  });

  gitpull.on("close", async function (code) {
    console.log("git pull exited with code " + code);
    if (code == 0) {
      isChecking = true;
      fs.writeFile(__dirname + "/proxies.txt", "", (error) => {
        if (error) {
          console.log(error);
        } else {
          console.log("proxies Empty!");
        }
      });
      const urls = await processLineByLine(__dirname + "/nodes.txt");

      let i = 1;
      for (const url of urls) {
        console.log("checking -> " + url);
        await spawnTest(url, i == urls.length).catch((err) => console.log(err));
        i++;
      }
    }
  });
}

getNodes();
cron.schedule("*/15 * * * *", () => {
  if (isChecking == false) {
    getNodes();
  }
});

const server = http.createServer((req, res) => {
  if (req.url == "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    const data = fs.readFileSync(__dirname + "/proxies.txt", "utf-8");
    res.end(data);
  }
  if (req.url == "/clash") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    const data = fs.readFileSync(__dirname + "/clash.yaml", "utf-8");
    res.end(data);
  }
});

server.listen(3000, () => {
  console.log("http running on port 3000");
});
