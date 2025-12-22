import * as path from "path";
import * as fs from "fs";

let hasRunCheck = false;
function checkUpdates() {
  if (hasRunCheck) {
    return;
  }
  hasRunCheck = true;
  const CYAN = "\x1b[36m";
  const GREEN = "\x1b[32m";
  const RED = "\x1b[31m";
  const RESET = "\x1b[0m";

  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  let packageJson: Record<string, any> = {};

  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    console.error("⚠️ Error reading package.json:", error);
  }

  const getLibraryVersion = (library: string): string => {
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    return (
      dependencies[library]?.replace(/^(\^|~)/, "") ||
      devDependencies[library]?.replace(/^(\^|~)/, "") ||
      "Not installed"
    );
  };

  const installedVersion = getLibraryVersion("apexify.js");

  fetch("https://registry.npmjs.com/-/v1/search?text=apexify.js")
    .then(response => response.json())
    .then(data => {
      const latestVersion = data.objects?.[0]?.package?.version;
      console.log(`${CYAN}🌐 Latest apexify.js Version: ${latestVersion}${RESET}`);

      if (!installedVersion || installedVersion === "Not installed") {
        console.log(`${RED}⚠️ apexify.js is not installed.${RESET}`);
        return;
      }

      if (latestVersion && installedVersion !== latestVersion) {
        console.log(`${CYAN}🚀 A new version of apexify.js is available: ${latestVersion}${RESET}`);
        console.log(`${CYAN}👉 Run 'npm install apexify.js@latest' to update.${RESET}`);
      } else {
        console.log(`${GREEN}✅ apexify.js is up to date! (${installedVersion})${RESET}`);
      }
    })
    .catch(error => console.error("⚠️ Error fetching latest apexify.js version:", error));

  if (!installedVersion || installedVersion === "Not installed") {
    console.log(`${RED}⚠️ apexify.js is not installed.${RESET}`);
  } else {
    console.log(`${GREEN}✅ apexify.js is already installed (Version: ${installedVersion}).${RESET}`);
  }
}
checkUpdates();

import { ApexPainter } from "./utils";

// Import and re-export with namespaces to prevent conflicts
import * as CanvasUtils from "./Canvas/utils/utils";
import * as CanvasTypes from "./Canvas/utils/types";

export { CanvasUtils, CanvasTypes };

export { ApexPainter };

const Apexify = {
    ApexPainter,
    CanvasUtils,
    CanvasTypes,
};

export default Apexify;