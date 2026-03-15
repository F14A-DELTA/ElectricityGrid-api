import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isAuthorized, validateAuth, enforceAuth } from "../auth";

describe("auth", () => {
    const ApiKey = process.env.API_KEY;

    beforeEach(() => {
        process.env.API_KEY = "my-secret-key";
    });

    afterEach(() => {
        process.env.API_KEY = ApiKey;
        vi.resetAllMocks();
    });

    describe("isAuthorised", () => {
        it("returns false when API_KEY is missing", () => {
            delete process.env.API_KEY;
            expect(isAuthorized("Bearer my-secret-key")).toBe(false);
        });

        it("returns false when the header is missing", () => {
            //delete process.env.API_KEY;
            expect(isAuthorized(undefined)).toBe(false);
        });

        it("returns false when header is not Bearer format", () => {
            expect(isAuthorized("Basic abc123")).toBe(false);
        });

        it("returns false when token is wrong", () => {
            expect(isAuthorized("Bearer wrong-key")).toBe(false);
        });

        it("returns true when token is correct", () => {
            expect(isAuthorized("Bearer my-secret-key")).toBe(true);
        });
    });

    describe("validateAuth", () => {
        it("returns true for a valid token", () => {
            const request = {
                headers: { authorization: "Bearer my-secret-key" },
            } as any;
            expect(validateAuth(request)).toBe(true);
        });

        it("returns false for an invalid token", () => {
            const request = {
                headers: { authorization: "hello 1234" },
            } as any;
            expect(validateAuth(request)).toBe(false);
        });
    });

    describe("enforceAuth", () => {
        it("Sends 401 when request is not authorised", async () => {
            const request = {
                headers: {authorization: "hello 1234"},
            } as any; 

            const send = vi.fn();
            const reply = {
                code: vi.fn().mockReturnValue({ send }),
            } as any;

            await enforceAuth(request, reply);
            expect(reply.code).toHaveBeenCalledWith(401);
            expect(send).toHaveBeenCalledWith({
                success: false,
                error: "Unauthorized",
            });
        });


        it("does not send 401 when request is authorized", async () => {
            const request = {
                headers: {authorization: "Bearer my-secret-key"},
            } as any; 

            const send = vi.fn();
            const reply = {
                code: vi.fn().mockReturnValue({ send }),
            } as any;

            await enforceAuth(request, reply);
            expect(reply.code).not.toHaveBeenCalledWith();
            expect(send).not.toHaveBeenCalled();
        });
    });
});