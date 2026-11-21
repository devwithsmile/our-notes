import { handleApi } from "../../../lib/api.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = (request) => handleApi(request);
export const POST = (request) => handleApi(request);
export const PUT = (request) => handleApi(request);
export const DELETE = (request) => handleApi(request);
