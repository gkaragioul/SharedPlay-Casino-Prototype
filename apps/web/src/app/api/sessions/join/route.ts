import { z } from "zod";
import { requireApiUser, apiErrorResponse } from "@/lib/auth";
import { joinSharedSession } from "../../../../../server/realtime/service";
import { SessionError } from "../../../../../server/realtime/errors";

const joinSchema = z.object({
  sessionId: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  amount: z.number().int().positive(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    const body = await request.json();
    const parsed = joinSchema.safeParse(body);
    if (!parsed.success || (!parsed.data.sessionId && !parsed.data.token)) {
      return Response.json({ error: "Invalid join request." }, { status: 400 });
    }

    const view = await joinSharedSession({
      sessionId: parsed.data.sessionId,
      token: parsed.data.token,
      userId: user.id,
      amount: parsed.data.amount,
    });

    return Response.json({ sessionId: view.id, view });
  } catch (error) {
    if (error instanceof SessionError) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return apiErrorResponse(error);
  }
}
