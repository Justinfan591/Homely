import { route, toId } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/auth";
import { loadJobFor } from "@/lib/jobs";
import { savePhoto } from "@/lib/photos";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireApiUser("customer");
  const job = loadJobFor(user, toId(id));
  if (job.status !== "intake") throw new HttpError(409, "Photos can only be added while describing the problem.");
  const form = await req.formData();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);
  const labels = form.getAll("labels").map(String);
  if (!files.length) throw new HttpError(400, "No photos received.");
  const saved = [];
  for (const [i, file] of files.entries()) saved.push(await savePhoto(job.id, user.id, file, labels[i]));
  return { photoIds: saved.map((p) => p.id) };
});
