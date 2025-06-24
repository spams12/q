export const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "مفتوح": return { view: { backgroundColor: "#3b82f6" }, text: { color: "#ffffff" } };
      case "قيد المعالجة": return { view: { backgroundColor: "#eab308" }, text: { color: "#000000" } };
      case "معلق": return { view: { backgroundColor: "#8b5cf6" }, text: { color: "#ffffff" } };
      case "مكتمل": return { view: { backgroundColor: "#22c55e" }, text: { color: "#ffffff" } };
      case "مغلق": return { view: { backgroundColor: "#6b7280" }, text: { color: "#ffffff" } };
      default: return { view: { backgroundColor: "#6b7280" }, text: { color: "#ffffff" } };
    }
}

export const getPriorityBadgeColor = (priority: string) => {
    switch (priority) {
      case "منخفضة": return { backgroundColor: "#22c55e" };
      case "متوسطة": return { backgroundColor: "#019EBF" };
      case "عالية": return { backgroundColor: "#f97316" };
      case "حرجة": return { backgroundColor: "#ef4444" };
      default: return { backgroundColor: "#6b7280" };
    }
}