import { Express } from "express";
import { ENV } from "../config/env";
import querystring from "querystring";
import { scope } from "../adapter/spotify";
import { randomUUID } from "crypto";
import { catchError, from, switchMap } from "rxjs";
import { PrismaClient } from "@prisma/client";
import axios from "axios";

export function main(app: Express, prisma: PrismaClient) {
    app.get("/login", function (req, res) {
        const state = randomUUID();

        res.redirect(
            "https://accounts.spotify.com/authorize?" +
                querystring.stringify({
                    response_type: "code",
                    client_id: ENV.SPOTIFY_CLIENT_ID,
                    scope: scope,
                    redirect_uri: "http://127.0.0.1:3000/callback",
                    state: state,
                })
        );
    });

    app.get("/callback", async function (req, res) {
        const code = req.query.code || null;
        const state = req.query.state || null;

        if (state === null) {
            res.redirect(
                "https://accounts.spotify.com/authorize?" +
                    querystring.stringify({
                        response_type: "code",
                        client_id: ENV.SPOTIFY_CLIENT_ID,
                        scope: scope,
                        redirect_uri: "http://127.0.0.1:3000/callback",
                        state: state,
                    })
            );
        } else {
            from(
                axios.post<{
                    access_token: string;
                    token_type: "Bearer";
                    expires_in: number;
                    refresh_token: string;
                    scope: string;
                }>(
                    "https://accounts.spotify.com/api/token",
                    {
                        code: req.query.code,
                        redirect_uri: "http://127.0.0.1:3000/callback",
                        grant_type: "authorization_code",
                    },
                    {
                        headers: {
                            "content-type": "application/x-www-form-urlencoded",
                            Authorization:
                                "Basic " +
                                Buffer.from(
                                    ENV.SPOTIFY_CLIENT_ID +
                                        ":" +
                                        ENV.SPOTIFY_CLIENT_SECRET
                                ).toString("base64"),
                        },
                    }
                )
            )
                .pipe(
                    switchMap(async (r) => {
                        console.log("[OK] login success");
                        console.log(r.data);
                        await prisma.user.deleteMany({});
                        await prisma.user.create({
                            data: {
                                refreshToken: r.data.refresh_token,
                                token: r.data.access_token,
                                expiresIn: r.data.expires_in,
                                type: r.data.token_type,
                            },
                        });
                        return r.data;
                    }),
                    catchError((e) => {
                        console.log("[ERROR] login failed");
                        console.log(e?.response?.data);
                        throw e;
                    })
                )
                .subscribe({
                    next: () => {
                        res.send("Success! You can now close the window.");
                    },
                    error: (e) => {
                        res.send("Error occurred during authentication.");
                    },
                });
        }
    });
}
