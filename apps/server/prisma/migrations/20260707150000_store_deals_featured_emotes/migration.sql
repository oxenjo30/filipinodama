-- Store Daily Deals + Featured + equippable emotes (prototype parity)
ALTER TABLE "StoreItem" ADD COLUMN "salePrice" INTEGER;
ALTER TABLE "StoreItem" ADD COLUMN "onSale" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreItem" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "equippedEmotes" TEXT[] DEFAULT ARRAY[]::TEXT[];
