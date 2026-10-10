import { Heart } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../auth/useAuth";
import { useListingFavorite } from "../useListingFavorite";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Pop } from "@/components/ui/motion";

interface ViewerFavoriteProps {
  listingId: string;
  isFavorited: boolean;
  /** Closes the photo viewer; run first when sign-in is about to open over it. */
  onBeforeSignIn: () => void;
}

/**
 * The ♡ in the photo viewer. The header ♡ on the same screen finishes a
 * Favorite parked for sign-in (`replayAfterSignIn`), so this one does not:
 * two replays would add the Favorite twice.
 */
export function ViewerFavorite({
  listingId,
  isFavorited,
  onBeforeSignIn,
}: ViewerFavoriteProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const favorite = useListingFavorite({
    listingId,
    isFavorited,
    isAuthenticated,
    returnTo: `/(public)/listings/${listingId}`,
  });

  return (
    <Button
      variant="ghost"
      size="icon"
      className="active:bg-white/20"
      accessibilityLabel={t("favorite")}
      accessibilityState={{ selected: favorite.favorited }}
      disabled={isAuthenticated === null}
      onPress={() => {
        // A React Native Modal sits above the navigation stack and would hide
        // the sign-in screen, so leave the viewer before opening it.
        if (isAuthenticated === false) onBeforeSignIn();
        favorite.toggle();
      }}
    >
      <Pop active={favorite.favorited}>
        <Icon
          as={Heart}
          className={
            favorite.favorited ? "size-6 text-primary fill-primary" : "size-6 text-white"
          }
        />
      </Pop>
    </Button>
  );
}
