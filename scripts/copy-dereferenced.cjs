const {
    copyFileSync,
    lstatSync,
    mkdirSync,
    readdirSync,
    statSync,
} = require("fs")
const path = require("path")

/**
 * Copy directory recursively, converting symlinks to regular files/directories.
 * This is needed because cpSync with dereference:true does NOT convert symlinks.
 * macOS codesign fails if bundle contains symlinks pointing outside the bundle.
 */
function copyDereferenced(src, dst) {
    const lstat = lstatSync(src)

    if (lstat.isSymbolicLink()) {
        // Follow symlink and check what it points to
        const stat = statSync(src)
        if (stat.isDirectory()) {
            // Symlink to directory: recursively copy the directory contents
            mkdirSync(dst, { recursive: true })
            for (const entry of readdirSync(src)) {
                copyDereferenced(path.join(src, entry), path.join(dst, entry))
            }
        } else {
            // Symlink to file: copy the actual file content
            mkdirSync(path.join(dst, ".."), { recursive: true })
            copyFileSync(src, dst)
        }
    } else if (lstat.isDirectory()) {
        mkdirSync(dst, { recursive: true })
        for (const entry of readdirSync(src)) {
            copyDereferenced(path.join(src, entry), path.join(dst, entry))
        }
    } else {
        mkdirSync(path.join(dst, ".."), { recursive: true })
        copyFileSync(src, dst)
    }
}

module.exports = copyDereferenced
