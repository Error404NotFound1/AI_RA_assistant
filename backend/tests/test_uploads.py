"""附件上传 API 测试"""
import pytest


@pytest.fixture
def temp_upload_dir(monkeypatch, tmp_path):
    """将上传目录重定向到临时目录，避免污染工作区"""
    monkeypatch.setattr("app.api.uploads.UPLOAD_DIR", str(tmp_path))
    return tmp_path


@pytest.mark.asyncio
async def test_upload_file(auth_client, test_project, temp_upload_dir):
    """测试上传文件"""
    project_id = test_project["id"]
    response = await auth_client.post(
        f"/api/v1/projects/{project_id}/attachments",
        files={"file": ("test.txt", b"Hello, this is test content!", "text/plain")},
    )
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["filename"] == "test.txt"
    assert data["file_size"] > 0
    assert data["file_type"] == "text/plain"


@pytest.mark.asyncio
async def test_list_attachments(auth_client, test_project, temp_upload_dir):
    """测试获取附件列表"""
    project_id = test_project["id"]
    # 上传两个文件
    await auth_client.post(
        f"/api/v1/projects/{project_id}/attachments",
        files={"file": ("file1.txt", b"content1", "text/plain")},
    )
    await auth_client.post(
        f"/api/v1/projects/{project_id}/attachments",
        files={"file": ("file2.md", b"# content2", "text/markdown")},
    )

    response = await auth_client.get(f"/api/v1/projects/{project_id}/attachments")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 2
    assert "id" in data[0]
    assert "filename" in data[0]
    assert "file_size" in data[0]


@pytest.mark.asyncio
async def test_download_attachment(auth_client, test_project, temp_upload_dir):
    """测试下载附件"""
    project_id = test_project["id"]
    # 先上传
    upload_resp = await auth_client.post(
        f"/api/v1/projects/{project_id}/attachments",
        files={"file": ("download.txt", b"Download test content", "text/plain")},
    )
    attachment_id = upload_resp.json()["id"]

    # 下载
    response = await auth_client.get(
        f"/api/v1/projects/{project_id}/attachments/{attachment_id}/download"
    )
    assert response.status_code == 200
    assert "Download test content" in response.text


@pytest.mark.asyncio
async def test_delete_attachment(auth_client, test_project, temp_upload_dir):
    """测试删除附件"""
    project_id = test_project["id"]
    # 先上传
    upload_resp = await auth_client.post(
        f"/api/v1/projects/{project_id}/attachments",
        files={"file": ("delete.txt", b"to be deleted", "text/plain")},
    )
    attachment_id = upload_resp.json()["id"]

    # 删除
    response = await auth_client.delete(
        f"/api/v1/projects/{project_id}/attachments/{attachment_id}"
    )
    assert response.status_code == 200
    assert "已删除" in response.json()["message"]

    # 验证附件已被删除
    list_resp = await auth_client.get(f"/api/v1/projects/{project_id}/attachments")
    attachments = list_resp.json()
    assert all(a["id"] != attachment_id for a in attachments)
