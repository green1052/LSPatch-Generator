import {exec} from "child_process";
import fs from "fs";
import * as cheerio from "cheerio";
import type {IncomingHttpHeaders} from "http";
import got from "got";
import pLimit from "p-limit";
import {CookieJar} from "tough-cookie";

interface Application {
    sources: DownloadSource[];
    arch?: "all" | "arm64-v8a" | "arm-v7a";
    allowdown?: boolean;
    debuggable?: boolean;
    embed?: string[];
    injectdex?: boolean;
    manager?: boolean;
    sigbypasslv?: 0 | 1 | 2;
}

interface DownloadSource {
    type: "apkpure" | "direct" | "apkmirror" | "uptodown" | "archive";
    url?: string;
}

interface Config {
    embeds: Record<string, string>;
    applications: Record<string, Application>;
}

function getEmbeds(embeds: string[]): string[] {
    return embeds.map((embed) => {
        const resolved = config.embeds[embed];
        if (!resolved) {
            throw new Error(`Embed '${embed}' is not defined in config.embeds`);
        }
        return resolved;
    });
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

function normalizeUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

function absolutizeUrl(base: string, href: string): string {
    return new URL(href, base).toString();
}

function validateArchiveSourceUrl(baseUrl: string): void {
    const normalized = normalizeUrl(baseUrl);

    if (/^https?:\/\/github\.com\/[^/]+\/[^/]+\/releases$/i.test(normalized)) {
        throw new Error(
            `Archive source must be a direct file-index URL, not a GitHub releases page: ${baseUrl}`
        );
    }

    if (/^https?:\/\/(www\.)?f-droid\.org\/repo$/i.test(normalized)) {
        throw new Error(
            `Archive source must be an app-specific file-index URL, not a shared repo root: ${baseUrl}`
        );
    }
}

async function getLatestArchiveUrl(baseUrl: string): Promise<string> {
    validateArchiveSourceUrl(baseUrl);

    const response = await client.get(baseUrl).text();
    const $ = cheerio.load(response);

    const candidates = $("a")
        .map((_, element) => $(element).attr("href"))
        .get()
        .filter((href): href is string => typeof href === "string")
        .filter((href) => /\.(apk|apkm|xapk|apks)$/i.test(href));

    if (candidates.length === 0) {
        throw new Error(
            `No apk/apkm/xapk/apks links found in archive URL: ${baseUrl}. ` +
            "Archive type requires a directory-style page listing direct APK files."
        );
    }

    const latest = [...candidates].sort((a, b) => b.localeCompare(a))[0];
    return absolutizeUrl(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`, latest);
}

function getArchiveDownloadUrl(baseUrl: string, pkgName: string, arch: "all" | "arm64-v8a" | "arm-v7a"): Promise<string> {
    return client.get(baseUrl).text().then((response) => {
        const $ = cheerio.load(response);
        const links = $("a")
            .map((_, element) => $(element).attr("href"))
            .get()
            .filter((href): href is string => typeof href === "string")
            .filter((href) => /\.(apk|apkm|apks|xapk)$/i.test(href));

        if (links.length === 0) {
            throw new Error(`No archive files found at: ${baseUrl}`);
        }

        const normalizedPkg = pkgName.toLowerCase();
        const normalizedArch = arch.toLowerCase();
        const withPkg = links.filter((href) => href.toLowerCase().includes(normalizedPkg));
        const candidates = withPkg.length > 0 ? withPkg : links;

        const byArch = candidates.filter((href) => href.toLowerCase().includes(`-${normalizedArch}.`));
        const finalCandidates = byArch.length > 0 ? byArch : candidates;

        const picked = [...finalCandidates].sort((a, b) => b.localeCompare(a))[0];
        return absolutizeUrl(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`, picked);
    });
}

async function getLatestApkMirrorUrl(baseUrl: string): Promise<string> {
    const appPage = await client.get(baseUrl).text();
    const app$ = cheerio.load(appPage);

    const releasePath = app$("a")
        .map((_, element) => app$(element).attr("href"))
        .get()
        .find((href) =>
            typeof href === "string"
            && href.includes("/apk/")
            && href.includes("-release/")
            && !href.includes("#")
        );

    if (!releasePath) {
        throw new Error(`Could not find release page on APKMirror URL: ${baseUrl}`);
    }

    const releaseUrl = absolutizeUrl(baseUrl, releasePath);
    const releasePage = await client.get(releaseUrl).text();
    const release$ = cheerio.load(releasePage);

    const firstDownloadPagePath = release$("a")
        .map((_, element) => release$(element).attr("href"))
        .get()
        .find((href) =>
            typeof href === "string"
            && (
                href.includes("/apk-download/")
                || href.includes("android-apk-download")
            )
            && !href.includes("#")
        );

    if (!firstDownloadPagePath) {
        throw new Error(`Could not find APKMirror download page for: ${releaseUrl}`);
    }

    const firstDownloadPageUrl = absolutizeUrl("https://www.apkmirror.com", firstDownloadPagePath);
    const firstDownloadPage = await client.get(firstDownloadPageUrl).text();
    const firstDownload$ = cheerio.load(firstDownloadPage);

    const directDownloadPath = firstDownload$("a")
        .map((_, element) => firstDownload$(element).attr("href"))
        .get()
        .find((href) =>
            typeof href === "string"
            && (
                /\/download\/\?key=/.test(href)
                || /\/wp-content\/themes\/APKM\/download\.php\?key=/.test(href)
            )
        );

    if (directDownloadPath) {
        return absolutizeUrl("https://www.apkmirror.com", directDownloadPath);
    }

    const intermediatePath = firstDownload$("a")
        .map((_, element) => firstDownload$(element).attr("href"))
        .get()
        .find((href) => typeof href === "string" && href.includes("/download/"));

    if (!intermediatePath) {
        throw new Error(`Could not find final APKMirror download URL for: ${firstDownloadPageUrl}`);
    }

    const intermediateUrl = absolutizeUrl("https://www.apkmirror.com", intermediatePath);
    const secondPage = await client.get(intermediateUrl).text();
    const second$ = cheerio.load(secondPage);
    const secondDirectPath = second$("a")
        .map((_, element) => second$(element).attr("href"))
        .get()
        .find((href) =>
            typeof href === "string"
            && (
                /\/download\/\?key=/.test(href)
                || /\/wp-content\/themes\/APKM\/download\.php\?key=/.test(href)
            )
        );

    if (!secondDirectPath) {
        throw new Error(`Could not find final APKMirror download URL for: ${firstDownloadPageUrl}`);
    }

    return absolutizeUrl("https://www.apkmirror.com", secondDirectPath);
}

async function getLatestUptodownUrl(baseUrl: string): Promise<string> {
    const downloadPageUrl = `${normalizeUrl(baseUrl)}/download`;
    const response = await client.get(downloadPageUrl).text();
    const $ = cheerio.load(response);

    const dataUrl = $("#detail-download-button").attr("data-url");
    if (!dataUrl) {
        const externalUrl = $("#detail-download-button").attr("data-url-ext");
        if (externalUrl) {
            throw new Error(`Uptodown page points to external installer URL (${externalUrl}), not a direct APK download.`);
        }
        throw new Error(`Could not find Uptodown download data-url from: ${downloadPageUrl}`);
    }

    return `https://dw.uptodown.com/dwn/${dataUrl}`;
}

async function resolveDownloadUrl(
    key: string,
    source: DownloadSource,
    application: Application
): Promise<string> {
    switch (source.type) {
        case "apkpure":
            return `https://d.apkpure.com/b/APK/${key}?version=latest`;
        case "direct":
            if (!source.url) {
                throw new Error(`Missing url for direct source: ${key}`);
            }
            return source.url;
        case "archive":
            if (!source.url) {
                throw new Error(`Missing url for archive source: ${key}`);
            }
            return getArchiveDownloadUrl(source.url, key, application.arch ?? "all");
        case "apkmirror":
            if (!source.url) {
                throw new Error(`Missing url for apkmirror source: ${key}`);
            }
            return getLatestApkMirrorUrl(source.url);
        case "uptodown":
            if (!source.url) {
                throw new Error(`Missing url for uptodown source: ${key}`);
            }
            return getLatestUptodownUrl(source.url);
        default:
            throw new Error(`Unsupported source type: ${(source as DownloadSource).type}`);
    }
}

function shellQuote(value: string): string {
    return `"${value.replaceAll("\"", "\\\"")}"`;
}

function detectExtensionFromUrl(url: string): "apk" | "apkm" | "xapk" | "apks" {
    const lower = url.toLowerCase();
    if (lower.includes(".apks")) return "apks";
    if (lower.includes(".apkm")) return "apkm";
    if (lower.includes(".xapk")) return "xapk";
    return "apk";
}

function detectExtension(downloadUrl: string, headers: IncomingHttpHeaders): "apk" | "apkm" | "xapk" | "apks" {
    const disposition = headers["content-disposition"];
    const dispositionText = Array.isArray(disposition) ? disposition.join(";") : (disposition ?? "");
    const match = dispositionText.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    if (match?.[1]) {
        const filename = decodeURIComponent(match[1]).replace(/"/g, "");
        return detectExtensionFromUrl(filename);
    }

    const contentType = (Array.isArray(headers["content-type"]) ? headers["content-type"][0] : headers["content-type"]) ?? "";
    if (/apks/i.test(contentType)) return "apks";
    if (/apkm/i.test(contentType)) return "apkm";
    if (/xapk/i.test(contentType)) return "xapk";

    return detectExtensionFromUrl(downloadUrl);
}

function isZipArchive(body: Uint8Array): boolean {
    return body.length >= 4
        && body[0] === 0x50
        && body[1] === 0x4b
        && (body[2] === 0x03 || body[2] === 0x05 || body[2] === 0x07)
        && (body[3] === 0x04 || body[3] === 0x06 || body[3] === 0x08);
}

async function mergeBundleToApk(bundlePath: string, outputApkPath: string): Promise<void> {
    const apkEditorJar = "bin/apkeditor.jar";
    if (!fs.existsSync(apkEditorJar)) {
        throw new Error("Missing bin/apkeditor.jar. Please place APKEditor jar in bin/ before running.");
    }
    const unsignedOutputPath = `${outputApkPath}.unsigned.apk`;
    const command = `java -jar ${shellQuote(apkEditorJar)} merge -i ${shellQuote(bundlePath)} -o ${shellQuote(unsignedOutputPath)} -clean-meta -f`;
    await execAsync(command);
    fs.copyFileSync(unsignedOutputPath, outputApkPath);
    fs.rmSync(unsignedOutputPath, {force: true});
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

    if (application.sigbypasslv !== undefined)
        append.push(`--sigbypasslv ${application.sigbypasslv}`);

    const cli = `java -jar ${shellQuote("bin/lspatch.jar")} -o ${shellQuote("output")} -f ${append.join(" ")} ${shellQuote(name)}`;

    console.log(cli);
    console.log(await execAsync(cli));
}

const config: Config = JSON.parse(fs.readFileSync("config.json", "utf8"));

const client = got.extend({
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    },
    cookieJar: new CookieJar(),
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
                        const sources = value.sources;
                        if (sources.length === 0) {
                            throw new Error(`No sources configured for ${key}.`);
                        }
                        let response: Uint8Array | null = null;
                        let selectedSource: DownloadSource | null = null;
                        let selectedUrl = "";
                        let selectedExtension: "apk" | "apkm" | "xapk" | "apks" = "apk";
                        const sourceErrors: string[] = [];

                        for (const source of sources) {
                            try {
                                const downloadUrl = await resolveDownloadUrl(key, source, value);
                                const downloadResponse = await client.get(downloadUrl, {responseType: "buffer"});
                                const body = downloadResponse.body;
                                const extension = detectExtension(downloadUrl, downloadResponse.headers);
                                if (!isZipArchive(body)) {
                                    throw new Error(`Downloaded content is not a valid APK archive (likely HTML/challenge page).`);
                                }
                                response = body;
                                selectedSource = source;
                                selectedUrl = downloadUrl;
                                selectedExtension = extension;
                                break;
                            } catch (sourceError) {
                                sourceErrors.push(`[${source.type}] ${sourceError instanceof Error ? sourceError.message : String(sourceError)}`);
                            }
                        }

                        if (!response || !selectedSource) {
                            throw new Error(`All download sources failed for ${key}:\n${sourceErrors.join("\n")}`);
                        }

                        console.log(`Using source ${selectedSource.type}: ${selectedUrl}`);

                        const downloadedName = `${key}.${selectedExtension}`;
                        const name = `${key}.apk`;
                        fs.writeFileSync(downloadedName, response);

                        if (selectedExtension === "apks" || selectedExtension === "apkm" || selectedExtension === "xapk") {
                            console.log(`Merging bundle ${downloadedName} -> ${name}`);
                            await mergeBundleToApk(downloadedName, name);
                        } else if (selectedExtension === "apk") {
                            if (downloadedName !== name) {
                                fs.copyFileSync(downloadedName, name);
                            }
                        } else {
                            throw new Error(`Downloaded unsupported package (${selectedExtension}).`);
                        }

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
