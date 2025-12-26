import * as path from "path";
import * as fs from "fs";

let hasRunCheck = false;
function checkUpdates() {
  if (hasRunCheck) {
    return;
  }
  hasRunCheck = true;

  try {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};
    const installedVersion = (dependencies["apexify.js"] || devDependencies["apexify.js"])?.replace(/^(\^|~)/, "");

    if (!installedVersion) {
      return;
    }

    fetch("https://registry.npmjs.com/-/v1/search?text=apexify.js")
      .then(response => response.json())
      .then(data => {
        const latestVersion = data.objects?.[0]?.package?.version;
        if (latestVersion && installedVersion !== latestVersion) {
          console.log(`\x1b[36m🚀 A new version of apexify.js is available: ${latestVersion}\x1b[0m`);
        }
      })
      .catch(() => {});
  } catch (error) {}
}
checkUpdates();

import { ApexPainter } from "./utils";

import * as CanvasUtils from "./Canvas/utils/utils";
import * as CanvasTypes from "./Canvas/utils/types";

export { CanvasUtils, CanvasTypes, ApexPainter };