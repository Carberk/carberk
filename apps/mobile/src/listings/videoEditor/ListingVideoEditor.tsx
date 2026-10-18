export interface ListingVideoEditorProps {
  ownerId: string;
  target: { kind: "draft" | "listing"; id: string };
  businessId?: string | undefined;
  disabled?: boolean | undefined;
}

export function ListingVideoEditor(_props: ListingVideoEditorProps) {
  return null;
}
