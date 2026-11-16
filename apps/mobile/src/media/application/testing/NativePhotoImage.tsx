import { Component, createElement } from "react";
import type { ImageProps } from "expo-image";

export class NativePhotoImage extends Component<ImageProps> {
  private dispatchError: NonNullable<ImageProps["onError"]> = event => {
    this.props.onError?.(event);
  };

  render() {
    return createElement("Image", { ...this.props, onError: this.dispatchError });
  }
}
