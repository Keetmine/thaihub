-- DropForeignKey
ALTER TABLE "FavoriteDrama" DROP CONSTRAINT "FavoriteDrama_userId_fkey";

-- DropForeignKey
ALTER TABLE "FavoriteDrama" DROP CONSTRAINT "FavoriteDrama_dramaId_fkey";

-- DropTable
DROP TABLE "FavoriteDrama";
