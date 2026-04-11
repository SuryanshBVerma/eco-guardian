'use strict';

const path = require('path');

/**
 * Generates a human-readable remediation hint based on ecosystem and dependency context.
 */
function generateRemediationHint({ ecosystem, packageName, fixedVersion, foundIn }) {
  if (!foundIn || foundIn.length === 0) {
    return fixedVersion ? `Upgrade to version ${fixedVersion}` : 'No known fixed version available.';
  }

  // Determine if it's primarily direct, transitive, or global
  let isGlobal = false;
  let isTransitive = false;
  let isDirect = false;
  
  const parents = new Set();
  const manifests = new Set();

  for (const entry of foundIn) {
    if (entry.dependency_type === 'global') isGlobal = true;
    else if (entry.dependency_type === 'transitive') {
      isTransitive = true;
      if (entry.parent && entry.parent.name) parents.add(entry.parent.name);
    } else if (entry.dependency_type === 'direct') {
      isDirect = true;
    }
    
    if (entry.manifest_path) manifests.add(path.basename(entry.manifest_path));
  }

  // Priority: Global > Direct > Transitive
  if (ecosystem === 'npm') {
    if (isGlobal) {
      return fixedVersion 
        ? `Run 'npm install -g ${packageName}@${fixedVersion}'` 
        : `Uninstall global package '${packageName}' or wait for a patch.`;
    }
    
    if (isDirect) {
      return fixedVersion 
        ? `Upgrade ${packageName} to version ${fixedVersion} in your package.json.` 
        : 'Update to a non-vulnerable version if available, or consider alternatives.';
    }
    
    if (isTransitive) {
      const parentList = Array.from(parents);
      const parentStr = parentList.length > 0 
        ? ` via **${parentList.join(', ')}**` 
        : '';
      const fixPart = fixedVersion 
        ? ` A fix is available in version ${fixedVersion}.` 
        : ' No known fix available yet.';
        
      return `Transitive dependency${parentStr}. Update the parent package(s) or use 'npm audit fix'.${fixPart}`;
    }
  }

  if (ecosystem === 'Maven' || ecosystem === 'NuGet') {
    const manifestList = Array.from(manifests);
    const scopeStr = manifestList.length > 0 ? ` in ${manifestList.join(', ')}` : '';
    
    if (fixedVersion) {
      return `Update ${packageName} to version ${fixedVersion}${scopeStr}.`;
    }
    return `Review ${packageName} usage${scopeStr}. No known patch available.`;
  }

  if (ecosystem === 'VSCode') {
    if (fixedVersion) return `Upgrade extension to version ${fixedVersion}.`;
    return 'Extension vulnerability. Check for updates in VSCode Marketplace.';
  }

  // Fallback
  return fixedVersion ? `Upgrade to version ${fixedVersion}` : 'Manual review required.';
}

module.exports = {
  generateRemediationHint
};
