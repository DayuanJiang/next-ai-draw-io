export default function ExamplePanel({
    setInput,
    setFiles,
}: {
    setInput: (input: string) => void;
    setFiles: (files: File[]) => void;
}) {
    // New handler for the "Replicate this flowchart" button
    const handleReplicateFlowchart = async () => {
        setInput("Replicate this flowchart.");

        try {
            // Fetch the example image
            const response = await fetch("/example.png");
            const blob = await response.blob();
            const file = new File([blob], "example.png", { type: "image/png" });

            // Set the file to the files state
            setFiles([file]);
        } catch (error) {
            console.error("Error loading example image:", error);
        }
    };

    // Handler for the "Replicate this in aws style" button
    const handleReplicateArchitecture = async () => {
        setInput("Replicate this in aws style");

        try {
            // Fetch the architecture image
            const response = await fetch("/architecture.png");
            const blob = await response.blob();
            const file = new File([blob], "architecture.png", {
                type: "image/png",
            });

            // Set the file to the files state
            setFiles([file]);
        } catch (error) {
            console.error("Error loading architecture image:", error);
        }
    };
    return (
        <div className="px-4 py-2 border-t border-b border-gray-100">
            <p className="text-sm text-gray-500 mb-2">
                {" "}
                Start a conversation to generate or modify diagrams.
            </p>
            <p className="text-sm text-gray-500 mb-2">
                {" "}
                You can also upload images to use as references.
            </p>
            <p className="text-sm text-gray-500 mb-2">Try these examples:</p>
            <div className="flex flex-wrap gap-5">
                <button
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-1 px-2 rounded"
                    onClick={() => setInput("Give me a **animated connector** diagram of transformer's architecture")}
                >
                    Draw diagram with Animated Connectors
                </button>
                <button
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-1 px-2 rounded"
                    onClick={handleReplicateArchitecture}
                >
                    Create AWS architecture
                </button>
                <button
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-1 px-2 rounded"
                    onClick={handleReplicateFlowchart}
                >
                    Replicate flowchart
                </button>
                <button
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-1 px-2 rounded"
                    onClick={() => setInput("Draw a cat for me")}
                >
                    Draw a cat
                </button>
            </div>
        </div>
    );
}
