import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@sharedplay/db";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { track } from "@/lib/analytics";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Enter your username and password." }, { status: 400 });
    }

    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return Response.json({ error: "Wrong username or password." }, { status: 401 });
    }

    track({ name: "user_login", userId: user.id, props: { username } });

    const response = Response.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        demoBalance: user.demoBalance,
        isAdmin: user.isAdmin,
      },
    });
    response.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${signSession(user.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    );
    return response;
  } catch (error) {
    console.error("[auth/login]", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
