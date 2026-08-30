"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { canUseLocation } from "@/lib/ownLocation";

export async function toggleLocationVisit(locationId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // id приходит с клиента: отметки — только на каталожных и своих
  // местах, чужое приватное место через отметку не «подсветить».
  if (!(await canUseLocation(locationId, user.id))) return;

  const existing = await prisma.locationVisit.findUnique({
    where: { userId_locationId: { userId: user.id, locationId } },
  });

  if (existing) {
    await prisma.locationVisit.delete({
      where: { userId_locationId: { userId: user.id, locationId } },
    });
  } else {
    await prisma.locationVisit.create({
      data: { userId: user.id, locationId },
    });
  }

  revalidatePath("/locations");
  revalidatePath(`/locations/${locationId}`);
  revalidatePath("/dramas");
}
