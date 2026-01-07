import argparse
import subprocess
import sys

def kill_process_on_port(port):
    """
    Finds and kills processes listening on the specified port.
    """
    try:
        # Find PIDs using lsof
        # -t: terse output (only PIDs)
        # -i: Internet address
        print(f"Checking for processes on port {port}...")
        cmd = ["lsof", "-t", f"-i:{port}"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0 or not result.stdout.strip():
            print(f"✅ No process found running on port {port}")
            return

        pids = result.stdout.strip().split('\n')
        
        print(f"⚠️  Found {len(pids)} process(es) on port {port}: {', '.join(pids)}")
        
        for pid in pids:
            try:
                if pid.strip():
                    print(f"Killing process {pid}...")
                    subprocess.run(["kill", "-9", pid], check=True)
                    print(f"✅ Successfully killed process {pid}")
            except subprocess.CalledProcessError as e:
                print(f"❌ Failed to kill process {pid}: {e}")

    except FileNotFoundError:
        print("❌ Error: 'lsof' command not found. Please ensure it is installed.")
    except Exception as e:
        print(f"❌ An error occurred: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Kill processes running on a specific port.")
    parser.add_argument("port", type=int, nargs="?", default=8000, help="Port number to clear (default: 8000)")
    args = parser.parse_args()
    
    kill_process_on_port(args.port)
