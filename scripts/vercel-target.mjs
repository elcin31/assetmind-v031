// Prevent this repository's other pre-existing Vercel links from publishing it.
const target = 'prj_0OQTvpMdNFAJFm2Ty0o536nHR7Qx';
const allowed = process.env.VERCEL_PROJECT_ID === target;
const ignoredBuildStep = process.argv.includes('--ignore');
console.log(allowed ? 'Verified deployment target: assetmind-v031-mpsk' : 'Skipping deployment: this is not the authorized assetmind-v031-mpsk project.');
// Vercel ignored-build convention: 0 cancels, 1 continues.
process.exit(ignoredBuildStep ? (allowed ? 1 : 0) : (allowed ? 0 : 1));
