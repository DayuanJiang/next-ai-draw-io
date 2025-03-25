export default function ExamplePanel({
    setInput,
    setFiles,
}: {
    setInput: (input: string) => void;
    setFiles: (files: FileList | undefined) => void;
}) {
    const createFileList = (file: File): FileList => {
        const dt = new DataTransfer();
        dt.items.add(file);
        return dt.files;
    };
    // New handler for the "Replicate this flowchart" button
    const handleReplicateFlowchart = async () => {
        setInput("Replicate this flowchart.");

        try {
            // Fetch the example image
            const response = await fetch("/example.png");
            const blob = await response.blob();
            const file = new File([blob], "example.png", { type: "image/png" });

            // Set the file to the files state
            setFiles(createFileList(file));
        } catch (error) {
            console.error("Error loading example image:", error);
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
                    onClick={handleReplicateFlowchart}
                >
                    Replicate this flowchart
                </button>
                <button
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-1 px-2 rounded"
                    onClick={() => setInput("Draw a cat for me")}
                >
                    Draw a cat for me
                </button>
            </div>
        </div>
    );
}
