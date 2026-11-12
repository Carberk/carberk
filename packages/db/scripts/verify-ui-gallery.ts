import { join } from "node:path";

import { ES300H_GALLERY } from "./ui-fixtures/manifest";
import { verifyGallery } from "./ui-fixtures/verify";

// Explicit offline operator command: no environment, service or seed configuration.
void verifyGallery(join(__dirname, "ui-fixtures/es300h-shenzhen-2025-07-17/v1"), ES300H_GALLERY)
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Gallery verification failed");
    process.exitCode = 1;
  });
