import { getSessionUser } from "@/lib/auth";

export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ user: null }, { status: 401 });
  }
  return Response.json({ user });
}
