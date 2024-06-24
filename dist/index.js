import got from "got";
import fs from "fs";
import { exec } from "child_process";
function getEmbeds(application) {
    return application.embeds.map(embed => config.embeds[embed]);
}
function execAsync(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout || stderr);
        });
    });
}
async function patch(name, application) {
    let append;
    if (application.manager) {
        append = `--manager`;
    }
    else {
        append = `-m "${getEmbeds(application).join(",")}"`;
    }
    const cli = `java -jar bin/lspatch.jar -o output -f ${append} -l ${application.sigbypasslv} ${name}`;
    console.log(cli);
    console.log(await execAsync(cli));
}
const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const client = got.extend({
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    },
    http2: true
});
for (const [key, value] of Object.entries(config.applications)) {
    const response = await client.get(`https://d.apkpure.com/b/APK/${key}?version=latest`).buffer();
    const name = `${key}.apk`;
    fs.writeFileSync(name, response);
    patch(name, value);
}
