import { lib, game, ui, get, ai, _status } from "../../../noname.js";
import { createProgress } from "../../../noname/library/update.js";

// 感谢秋礼提供的在线更新OwO，我在此基础上进行了一些修改
/**
 * 更新函数
 * @param {boolean}
 */
export default async (manual = false) => {
    if (_status.connectMode && manual) {
        alert("联机状态下无法更新");
        return;
    }
    if (!window.navigator.onLine && manual) {
        alert("无网络连接，无法检查更新");
        return;
    }
    if (!manual && sessionStorage.wumihuaxian_check) return;
    sessionStorage.wumihuaxian_check = true;
    const proxyList = [
        "",
        "https://gh-proxy.com/",
        "https://hk.gh-proxy.com/",
        "https://tvv.tw/",
    ];
    let proxy = proxyList[lib.config.extension_错乱时空_update_source] || "";
    let remoteManifest = null;
    let success = false;
    for (const p of [proxy, ...proxyList.filter(x => x !== proxy)]) {
        try {
            // 加时间戳防缓存
            const url = `${p}https://raw.githubusercontent.com/TianJiangshi/clsk/manifest.json?${Date.now()}`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) {
                remoteManifest = await res.json();
                proxy = p;
                success = true;
                break;
            }
        } catch (e) {
            console.warn("镜像失败", p, e);
        }
    }
    if (!success) {
        if (manual) alert("获取更新清单失败，请检查网络或切换镜像");
        return;
    }
    // 版本号对比
    let localVersion = "0.0.0";
    const localManifestPath = "extension/错乱时空/manifest.json";
    const localManifestExists = await game.promises.checkFile(localManifestPath);
    if (localManifestExists) {
        try {
            const localData = await game.promises.readFile(localManifestPath);
            const localManifest = JSON.parse(new TextDecoder().decode(localData));
            localVersion = localManifest.version || "0.0.0";
        } catch (e) {
            console.warn("读取本地manifest失败", e);
        }
    }
    const isRemoteNewer = remoteManifest.version > localVersion;
    if (!isRemoteNewer) {
        if (manual) alert(`已是最新版本(${remoteManifest.version})`);
        return;
    }
    // 白名单
    const PROTECTED_PATHS = [
        "存档/",
    ];
    const isProtected = (filePath) => {
        return PROTECTED_PATHS.some(p => filePath.startsWith(p));
    };
    // 对比文件哈希
    const needUpdate = [];
    const hex = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
    for (const [filePath, remoteHash] of Object.entries(remoteManifest.files)) {
        if (isProtected(filePath)) continue;
        const localFullPath = `extension/错乱时空/${filePath}`;
        const exists = await game.promises.checkFile(localFullPath);
        if (!exists) {
            needUpdate.push(filePath);
            continue;
        }
        const isImageVideo = filePath.endsWith('.jpg') || filePath.endsWith('.gif') || filePath.endsWith('.png') || filePath.endsWith('.mp4') || filePath.endsWith('.mp3');
        if (isImageVideo) {
            continue;
        }
        try {
            const buf = await crypto.subtle.digest('SHA-1', await game.promises.readFile(localFullPath));
            const localHash = Array.from(new Uint8Array(buf), x => hex[x]).join('');
            if (localHash !== remoteHash) needUpdate.push(filePath);
        } catch {
            needUpdate.push(filePath);
        }
    }
    if (needUpdate.length === 0) {
        if (manual) alert(`已是最新版本(${remoteManifest.version})`);
        return;
    }
    if (manual && !confirm(`【错乱时空】发现新版本${remoteManifest.version}\n需更新${needUpdate.length}个文件，是否更新？`)) {
        return;
    }
    const prog = createProgress("更新错乱时空扩展", needUpdate.length);
    game.importedPack = true;
    try {
        // 下载失败直接跳过
        for (let i = 0; i < needUpdate.length; i++) {
            const file = needUpdate[i];
            prog.setFileName(`正在下载：${file}`);
            prog.setProgressValue(i + 1);
            try {
                // 每个文件都加时间戳
                const url = `${proxy}https://raw.githubusercontent.com/TianJiangshi/clsk/${file}?${Date.now()}`;
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 15000);
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timer);
                if (!res.ok) {
                    console.warn("跳过无法下载的文件：" + file);
                    continue;
                }
                const data = await res.arrayBuffer();
                const fullPath = `extension/错乱时空/${file}`;
                const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
                await game.promises.createDir(dir);
                await game.promises.writeFile(data, dir, fullPath.split('/').pop());
            } catch (e) {
                console.warn("下载失败，已跳过：" + file, e);
                continue;
            }
        }
        await game.promises.writeFile(
            JSON.stringify(remoteManifest, null, 2),
            "extension/错乱时空",
            "manifest.json"
        );
        try {
            const clean = async (dir, prefix = '') => {
                const [subDirs, files] = await game.promises.getFileList(dir);
                let all = files.map(f => prefix ? `${prefix}/${f}` : f);
                for (const d of subDirs) {
                    all = all.concat(await clean(`${dir}/${d}`, prefix ? `${prefix}/${d}` : d));
                }
                return all;
            };
            const localFiles = await clean("extension/错乱时空");
            const toDelete = localFiles.filter(f =>
                !remoteManifest.files[f] &&
                f !== "manifest.json" &&
                !isProtected(f)
            );
            if (toDelete.length) {
                const delProg = createProgress("清理旧文件", toDelete.length);
                for (let i = 0; i < toDelete.length; i++) {
                    delProg.setProgressValue(i + 1);
                    await game.promises.removeFile(`extension/错乱时空/${toDelete[i]}`);
                }
                delProg.remove();
            }
        } catch (e) {
            console.warn("清理旧文件失败", e);
        }
        alert("更新完成！游戏即将重启");
        game.reload();
    } catch (err) {
        console.error("更新整体异常", err);
        if (manual) alert("更新出现异常，但已跳过错误文件");
    } finally {
        prog.remove();
        delete game.importedPack;
    }
};
