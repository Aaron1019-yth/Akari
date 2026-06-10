from datetime import date, timedelta
import os


def test_generate_plan_and_record_practice(client) -> None:
    payload = {
        "target_score": 150,
        "exam_date": str(date.today() + timedelta(days=120)),
        "strengths": ["言语理解与表达"],
        "weaknesses": ["资料分析"],
    }
    goal_response = client.post("/api/planner/generate", json=payload)
    assert goal_response.status_code == 200
    goal = goal_response.json()
    assert goal["title"] == "Akari 公考备考计划"
    assert goal["weekly_plan"]["tasks"]

    task = goal["weekly_plan"]["tasks"][0]
    practice_response = client.post(
        "/api/practice/session",
        json={
            "daily_task_id": task["id"],
            "module_id": task["module_id"],
            "question_count": 30,
            "correct_count": 21,
            "duration_seconds": 1800,
            "tags": ["增长率"],
        },
    )
    assert practice_response.status_code == 200
    practice = practice_response.json()
    assert practice["session"]["accuracy"] == 0.7
    assert practice["task"]["status"] == "completed"

    create_task_response = client.post(
        "/api/planner/task",
        json={
            "title": "资料复盘",
            "type": "review",
            "subject": "资料分析",
            "estimated_minutes": 25,
            "time_slot": "evening",
            "date": str(date.today()),
        },
    )
    assert create_task_response.status_code == 200
    created_goal = create_task_response.json()
    created_task = next(task for task in created_goal["weekly_plan"]["tasks"] if task["title"] == "资料复盘")
    assert created_task["status"] == "pending"
    assert created_task["time_slot"] == "evening"

    patch_response = client.patch(
        f"/api/planner/task/{created_task['id']}",
        json={"status": "completed", "actual_minutes": 12},
    )
    assert patch_response.status_code == 200
    patched_goal = patch_response.json()
    patched_task = next(task for task in patched_goal["weekly_plan"]["tasks"] if task["id"] == created_task["id"])
    assert patched_task["status"] == "completed"
    assert patched_task["actual_minutes"] == 12

    # Test task edit (title + estimated_minutes)
    edit_response = client.patch(
        f"/api/planner/task/{created_task['id']}",
        json={"title": "资料复盘修订版", "estimated_minutes": 40},
    )
    assert edit_response.status_code == 200
    edited_goal = edit_response.json()
    edited_task = next(task for task in edited_goal["weekly_plan"]["tasks"] if task["id"] == created_task["id"])
    assert edited_task["title"] == "资料复盘修订版"
    assert edited_task["estimated_minutes"] == 40

    # Test task delete
    delete_response = client.delete(f"/api/planner/task/{created_task['id']}")
    assert delete_response.status_code == 200
    deleted_goal = delete_response.json()
    assert not any(task["id"] == created_task["id"] for task in deleted_goal["weekly_plan"]["tasks"])

    if os.getenv("DEEPSEEK_API_KEY"):
        chat_response = client.post(
            "/api/chat",
            json={"session_id": "smoke", "message": "今天怎么复盘资料分析？"},
        )
        assert chat_response.status_code == 200
        chat = chat_response.json()
        assert chat["session_id"] == "smoke"
        assert chat["message"]["role"] == "assistant"
        assert len(chat["message"]["content"]) > 0
