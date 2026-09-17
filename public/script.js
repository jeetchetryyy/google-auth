    async function handleCredentialResponse(response) {
        try {
            const result = await fetch("/auth/google", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    credential: response.credential
                    
                })
            });

            const data = await result.json();

            if (data.success) {
                alert("Welcome " + data.user.name);
                console.log("User:", data.user);
            } else {
                alert("Login failed");
            }

        } catch (error) {
            console.error("Error:", error);
            alert("Something went wrong");
        }
    }