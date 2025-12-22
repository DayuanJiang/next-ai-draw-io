/**
 * electron-builder afterPack hook
 * Copies node_modules to the standalone directory in the packaged app
 */

const { cpSync, existsSync } = require("fs")
const path = require("path")

module.exports = async function (context) {
    const appOutDir = context.appOutDir
    const resourcesDir = path.join(
        appOutDir,
        context.packager.platform.name === "mac"
            ? `${context.packager.appInfo.productFilename}.app/Contents/Resources`
            : "resources"
    )
    const standaloneDir = path.join(resourcesDir, "standalone")
    const sourceNodeModules = path.join(
        context.packager.projectDir,
        "electron-standalone",
        "node_modules"
    )
    const targetNodeModules = path.join(standaloneDir, "node_modules")

    console.log(`[afterPack] Copying node_modules to ${targetNodeModules}`)

    if (existsSync(sourceNodeModules) && existsSync(standaloneDir)) {
        cpSync(sourceNodeModules, targetNodeModules, { recursive: true })
        console.log("[afterPack] node_modules copied successfully")
    } else {
        console.error("[afterPack] Source or target directory not found!")
        console.error(`  Source: ${sourceNodeModules} exists: ${existsSync(sourceNodeModules)}`)
        console.error(`  Target dir: ${standaloneDir} exists: ${existsSync(standaloneDir)}`)
        throw new Error(
            "[afterPack] Failed: Required directories not found. " +
            "Ensure 'npm run electron:prepare' was run before building."
        )
    }
}
