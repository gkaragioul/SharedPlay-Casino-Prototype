import { z } from "zod";
import { requireApiUser, apiErrorResponse } from "@/lib/auth";
import { createSharedSession } from "../../../../server/realtime/service";
import { SessionError } from "../../../../server/realtime/errors";

const createSchema = z.object({
  gameSlug: z.string().min(1),
  contribution: z.number().int().positive(),
  maxParticipants: z.number().int().min(2).max(8).optional(),
  controlRotationEvery: z.number().int().min(3).max(50).optional(),
  demoBot: z.boolean().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid session details." }, { status: 400 });
    }

    const result = await createSharedSession({
      hostId: user.id,
      gameSlug: parsed.data.gameSlug,
      contribution: parsed.data.contribution,
      maxParticipants: parsed.data.maxParticipants,
      controlRotationEvery: parsed.data.controlRotationEvery,
      demoBot: parsed.data.demoBot === true,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof SessionError) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return apiErrorResponse(error);
  }
}
