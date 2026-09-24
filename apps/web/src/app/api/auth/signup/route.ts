import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@sharedplay/db";
import { DEMO_STARTING_BALANCE } from "@sharedplay/types";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { track } from "@/lib/analytics";

const signupSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers and underscore only"),
  displayName: z.string().min(1).max(40),
  password: z.string().min(6).max(72),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid details.";
      return Response.json({ error: message }, { status: 400 });
    }

    const { username, displayName, password } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return Response.json({ error: "That username is already taken." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash,
        demoBalance: DEMO_STARTING_BALANCE,
        avatar: "🎰",
      },
      select: { id: true, username: true, displayName: true, avatar: true, demoBalance: true },
    });

    track({ name: "user_signup", userId: user.id, props: { username } });

    const response = Response.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        demoBalance: user.demoBalance,
      },
    });
    response.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${signSession(user.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    );
    return response;
  } catch (error) {
    console.error("[auth/signup]", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
