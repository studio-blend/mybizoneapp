// RSA public key for verifying offline license keys.
// The matching private key is kept secret and used only by scripts/generate-license.ts.
// This key is safe to commit — it can only verify signatures, not create them.
export const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0jadjkwgjBsyJFEQ91aM
q0EwgAPAVnZ058f/5X/FZsxHTxdmCNv2jAFAgDO6e7ysJ+BVVtnu4sm3xwJEvXKz
dCmlbYgI5NqRDGWo//5y3mcTSkG4HgK6Y1Akk/3FQLBf8Q6kn98GEUPTZvSKxsHB
dHw/QaxR9SB1Uaw+lRuhS3bltgDT/WzxToHx0f93c1q0Tt+x7y6qG8og/b5e2bI4
JzlPKAK4RA5gpzh0VeINj+GNvhYJyKebQaNY+GzDRo2lBdkf8shVXFpT0BQzPryA
GoOHE4Tq4B1DvtRG5NrpklgMnxmobK+XGV/AYpJEGLG7kYYL1eBijKRUkO+MtkwH
JwIDAQAB
-----END PUBLIC KEY-----`;
