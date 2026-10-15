import { requireNativeModule } from "expo";

import type { VideoPreparationPort } from "../../src/listings/videoPreparation/VideoPreparation";

export default requireNativeModule<VideoPreparationPort>("ListingVideoPreparation");
