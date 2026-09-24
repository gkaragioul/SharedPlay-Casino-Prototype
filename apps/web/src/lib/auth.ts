import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@sharedplay/db";
import type { PublicUser } from "@sharedplay/types";
import { SESSION_COOKIE, verifySession } from "./session";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  demoBalance: number;
  isAdmin: boolean;
};

export function toPublicUser(user: {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
  };
}

/**
 * Current user for server components and route handlers. Cached per request
 * (React `cache`) so a layout + page + handler don't hit the database thrice.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = verifySession(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      demoBalance: true,
      isAdmin: true,
    },
  });
  if (!user) return null;
  return user;
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new ApiHttpError(401, "Not signed in");
  }
  return user;
}

export class ApiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ApiHttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}
