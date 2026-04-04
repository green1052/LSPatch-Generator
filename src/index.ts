import {exec} from "child_process";
import fs from "fs";
import got from "got";
import pLimit from "p-limit";

interface Application {
    type: "apkpure" | "direct";
    url?: string;
    allowdown?: boolean;
    debuggable?: boolean;
    embed?: string[];
    injectdex?: boolean;
    manager?: boolean;
    sigbypasslv?: 0 | 1 | 2;
}

interface Config {
    embeds: Record<string, string>;
    applications: Record<string, Application>;
}

function getEmbeds(embeds: string[]): string[] {
    return embeds.map((embed) => config.embeds[embed]);
}

function execAsync(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, (error: any, stdout: any, stderr: any) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(stdout || stderr);
        });
    });
}

async function patch(name: string, application: Application) {
    let append: string[] = [];

    if (application?.allowdown === true)
        append.push("--allowdown");

    if (application?.debuggable === true)
        append.push("--debuggable");

    if (application?.injectdex === true)
        append.push("--injectdex");

    if (application?.manager === true) {
        append.push("--manager");
    } else if (application.embed) {
        append.push(`--embed "${getEmbeds(application.embed).join(",")}"`);
    }

    if (application?.sigbypasslv)
        append.push(`--sigbypasslv ${application.sigbypasslv}`);

    const cli = `java -jar bin/lspatch.jar -o output -f ${append.join(" ")} ${name}`;

    console.log(cli);
    console.log(await execAsync(cli));
}

const config: Config = JSON.parse(fs.readFileSync("config.json", "utf8"));

const client = got.extend({
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    },
    http2: true
});

const limit = pLimit(2);

await Promise.all(
    Object.entries(config.applications)
        .map(([key, value]) =>
            limit(
                async () => {
                    try {
                        console.log(`Downloading ${key}`);

                        const response = await client.get(value.type === "apkpure" ? `https://d.apkpure.com/b/APK/${key}?version=latest` : value.url!).buffer();

                        const name = `${key}.apk`;
                        fs.writeFileSync(name, response);

                        await patch(name, value);
                    } catch (e) {
                        console.error(e);
                    } finally {
                        console.log(`Done with ${key}`);
                    }
                }
            )
        )
);