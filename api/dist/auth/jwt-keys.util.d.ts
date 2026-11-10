export type JwtKey = {
    kid: string;
    secret: string;
};
export declare function loadJwtKeysFromEnv(rawJson: string | undefined, fallbackSecret: string | undefined): JwtKey[];
export declare function resolveActiveJwtKey(keys: JwtKey[], activeKid: string | undefined): JwtKey;
export declare function resolveVerificationKeys(keys: JwtKey[], tokenKid: string | undefined): JwtKey[];
