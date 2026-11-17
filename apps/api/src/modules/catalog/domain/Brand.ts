export type Brand = {
  id: string;
  slug: string;
  nameRu: string;
  nameTk: string;
  nameEn: string;

  logoKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
};
