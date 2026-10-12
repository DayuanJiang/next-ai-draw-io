// The DOMParser and XMLSerializer globals the XML helpers need, installed
// before every test file as index.ts does at startup
import { installDomPolyfill } from "../src/dom.ts"

installDomPolyfill()
