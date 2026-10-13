import cv2
import time

for index in [0, 1]:
    cap = cv2.VideoCapture(index)

    if not cap.isOpened():
        print(f"Camera {index}: FAILED")
        continue

    print(f"Camera {index}: OPENED — showing for 5 seconds")

    start = time.time()

    while time.time() - start < 5:
        ret, frame = cap.read()

        if not ret:
            print(f"Camera {index}: failed to read frame")
            break

        cv2.imshow(f"Camera {index}", frame)

        # Keep the window responsive
        cv2.waitKey(1)

    cap.release()
    cv2.destroyAllWindows()
    cv2.waitKey(100)

print("Test finished.")