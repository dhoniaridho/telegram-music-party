import { useEffect, useState } from "react";
import { addToast, Button, Input } from "@heroui/react";
import { firstValueFrom, from, map, of, switchMap } from "rxjs";

function App() {
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        await chrome.storage.local.set({
            partyUrl: data.get("partyUrl"),
            roomId: data.get("roomId"),
        });

        addToast({
            title: "Updated Party Config",
        });
        const url = "*://*.youtube.com/*";
        chrome.tabs.query({ url: url }, (tabs) => {
            tabs.forEach((t) => chrome.tabs.reload(t.id as number));
        });
    };

    const [partyUrl, setPartyUrl] = useState("");

    useEffect(() => {
        firstValueFrom(
            from(chrome.storage?.local?.get("partyUrl") || of()).pipe(
                map((v) => v.partyUrl as string),
                switchMap(async (v) => {
                    if (!v) {
                        const defaultValue = "https://party.dhoniaridho.com";
                        return defaultValue;
                    }
                    setPartyUrl(v);
                    return v;
                }),
                switchMap(async (v) => {
                    console.log(v);
                    await chrome.storage.local.set({
                        partyUrl: v,
                    });

                    setPartyUrl(v);
                    return v;
                })
            )
        );
    }, []);

    return (
        <main className="bg-slate-800 min-w-[400px] min-h-[400px]">
            <div className="flex justify-center items-center w-full min-h-screen">
                <div className="flex flex-col gap-5 justify-center items-center">
                    <form
                        className="w-full flex items-center justify-center gap-3 flex-col"
                        onSubmit={handleSubmit}
                    >
                        <Input
                            name="partyUrl"
                            label="Party Url"
                            defaultValue={partyUrl}
                            placeholder="http://localhost:3000"
                        />
                        <Input
                            name="roomId"
                            label="Room Id"
                            defaultValue={partyUrl}
                            placeholder="Room Id"
                        />
                        <Button size="sm" type="submit" color="primary" className="w-full">
                            Submit
                        </Button>
                    </form>
                </div>
            </div>
        </main>
    );
}

export default App;
