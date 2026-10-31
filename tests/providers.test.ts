import { describe, test, expect, vi, afterEach } from "vitest";
import { parseResponse, callProvider, reserveMicros, instructions, MAX_OUTPUT } from "../src/lib/providers";
// Synthetic fixtures only. Never seeded into an application database.
export const openaiFixture = { id:"fixture-response", model:"gpt-4.1-mini-2025-04-14", status:"completed", output:[{type:"message",content:[{type:"output_text",text:"Karburo est une option. Concurrent Test aussi.",annotations:[{type:"url_citation",url:"https://example.com/fixture",title:"Synthetic citation"}]}]}], usage:{input_tokens:200,output_tokens:100} };
describe("official API normalization with synthetic fixtures", () => {
  afterEach(()=>vi.restoreAllMocks());
  test("OpenAI preserves returned model, usage and structured citation", () => {
    const r=parseResponse("openai",openaiFixture); expect(r.status).toBe("succeeded");expect(r.model).toBe(openaiFixture.model);expect(r.input).toBe(200);expect(r.citations[0].provenance).toBe("openai_url_annotation");
  });
  test("truncations and refusals are not valid absences", () => {
    expect(parseResponse("openai",{...openaiFixture,status:"incomplete"}).status).toBe("invalid");
    expect(parseResponse("openai",{...openaiFixture,output:[{type:"message",content:[{type:"refusal"}]}]}).status).toBe("invalid");
    expect(parseResponse("gemini",{promptFeedback:{blockReason:"SAFETY"}}).status).toBe("invalid");
  });
  test("Gemini ignores thoughts, includes thinking usage and parses grounding only", () => {
    const r=parseResponse("gemini",{modelVersion:"returned-model",responseId:"fixture-google",candidates:[{finishReason:"STOP",content:{parts:[{text:"private reasoning",thought:true},{text:"Karburo and https://unverified.example"}]},groundingMetadata:{groundingChunks:[{web:{uri:"https://example.com/source",title:"Fixture"}}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:5}});
    expect(r.status).toBe("succeeded");expect(r.output).toBe(25);expect(r.text).not.toContain("reasoning");expect(r.citations).toHaveLength(1);
  });
  test("missing usage is unknown and generated URLs are not citations", () => {
    const r=parseResponse("gemini",{candidates:[{finishReason:"STOP",content:{parts:[{text:"See https://example.com"}]}}]});
    expect(r.input).toBeNull();expect(r.output).toBeNull();expect(r.citations).toEqual([]);
  });
  test("rejects malformed payloads",()=>{expect(()=>parseResponse("openai",{...openaiFixture,usage:{input_tokens:-1,output_tokens:2}})).toThrow();});
  test("uses fixed official endpoints, finite output, timeout and no redirects",async()=>{
    const mock=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify(openaiFixture),{status:200}));
    await callProvider("openai","fixture-not-a-real-key","Question?",instructions("fr","FR"));
    const [url,opts]=mock.mock.calls[0];expect(url).toBe("https://api.openai.com/v1/responses");expect(opts?.redirect).toBe("error");
    expect(JSON.parse(opts?.body as string)).toMatchObject({max_output_tokens:MAX_OUTPUT,store:false});expect(opts?.signal).toBeDefined();
  });
  test("HTTP errors are sanitized, with no automatic retry",async()=>{
    const mock=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response('secret token in upstream error',{status:401}));
    await expect(callProvider("gemini","fixture-not-a-real-key","Question?","French")).rejects.toThrow("provider_http_401");expect(mock).toHaveBeenCalledTimes(1);
  });
  test("reservation covers byte-based input upper estimate and bounded output",()=>{
    expect(reserveMicros("openai","été?","fr")).toBeGreaterThan(MAX_OUTPUT*1.6);
  });
});
