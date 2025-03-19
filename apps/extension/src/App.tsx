import { useEffect, useState } from "react";
import {
    muteCommand,
    nextCommand,
    pauseCommand,
    playCommand,
    prevCommand,
    volumeDownCommand,
    volumeUpCommand,
} from "./lib/chrome";
import { addToast, Button, Input } from "@heroui/react";
import { firstValueFrom, from, map, switchMap } from "rxjs";

function App() {
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        await chrome.storage.local.set({ partyUrl: data.get("partyUrl") });
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
            from(chrome.storage.local.get("partyUrl")).pipe(
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
                        className="w-full flex items-center gap-3"
                        onSubmit={handleSubmit}
                    >
                        <Input
                            name="partyUrl"
                            label="Party Url"
                            defaultValue={partyUrl}
                            placeholder="http://localhost:3000"
                            endContent={
                                <Button size="sm" type="submit">
                                    Submit
                                </Button>
                            }
                        />
                    </form>
                    <div className="grid grid-cols-4 gap-5">
                        <Button size="sm" color="primary" onPress={playCommand}>
                            Play
                        </Button>
                        <Button size="sm" onPress={pauseCommand}>
                            Pause
                        </Button>
                        <Button size="sm" onPress={nextCommand}>
                            Next
                        </Button>
                        <Button size="sm" onPress={prevCommand}>
                            Prev
                        </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-5">
                        <Button size="sm" onPress={muteCommand}>
                            Mute
                        </Button>
                        <Button size="sm" onPress={volumeDownCommand}>
                            Volume -
                        </Button>
                        <Button size="sm" onPress={volumeUpCommand}>
                            Volume +
                        </Button>
                    </div>
                </div>
            </div>
        </main>
    );
}

export default App;
